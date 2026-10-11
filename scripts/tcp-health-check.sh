#!/usr/bin/env bash
#
# OpenStore 服务器 TCP 健康自检
#
# 检查内核 TCP OOM 计数、TCP 内存占 tcp_mem 的比例、Recv-Q 积压、TIME_WAIT、
# node 的 fd 数、TcpAbortOnMemory 增量、可用内存与 Swap。
#
# 用法（宝塔「计划任务」→ Shell 脚本，每分钟一次、勾选通知；退出码非 0 即告警）：
#     bash /www/wwwroot/openstore/scripts/tcp-health-check.sh --quiet
#
# 阈值可用环境变量覆盖，见下面「阈值」一段。
#
set -uo pipefail

QUIET=0
case "${1:-}" in
  --quiet|-q) QUIET=1 ;;
  -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
esac

# —— 阈值 ——
MEM_RATIO_WARN="${MEM_RATIO_WARN:-70}"      # 内核 TCP 内存 / tcp_mem 硬上限（百分比）
MEM_RATIO_FAIL="${MEM_RATIO_FAIL:-90}"
RECVQ_WARN="${RECVQ_WARN:-65536}"           # 单条 TCP 连接的 Recv-Q（字节）
RECVQ_FAIL="${RECVQ_FAIL:-262144}"
TIME_WAIT_WARN="${TIME_WAIT_WARN:-20000}"
NODE_FD_WARN="${NODE_FD_WARN:-20000}"
OOM_WINDOW_MIN="${OOM_WINDOW_MIN:-10}"      # 最近多少分钟内出现过内核 TCP OOM 就算失败
ALERT_ON_WARN="${ALERT_ON_WARN:-0}"         # 设 1 时，只有 WARN 也让退出码非 0
STATE_FILE="${STATE_FILE:-/tmp/openstore-tcp-health.state}"

FAILED=0
WARNED=0
say()  { [ "$QUIET" = 1 ] || printf '%s\n' "$*"; }
fail() { FAILED=1; printf '[FAIL] %s\n' "$*"; }
warn() { WARNED=1; printf '[WARN] %s\n' "$*"; }
# 把命令输出里的空白/空值统一成纯数字，避免 [ -ge ] 撞上 " 12" 这类带空格的计数
num() { printf '%s' "${1:-0}" | tr -dc '0-9'; }

say "== OpenStore TCP 自检 $(date '+%F %T %Z') =="

# 1) 内核自己有没有报过 TCP OOM —— 这是最直接的信号
oom_count=0
oom_source=''
if command -v journalctl >/dev/null 2>&1; then
  oom_count=$(num "$(journalctl --since "-${OOM_WINDOW_MIN}min" -k --no-pager 2>/dev/null \
    | grep -c 'consider tuning tcp_mem' || true)")
  oom_source="journalctl -k，最近 ${OOM_WINDOW_MIN} 分钟"
fi
if [ "${oom_count:-0}" -eq 0 ] && [ -z "$oom_source" ] && command -v dmesg >/dev/null 2>&1; then
  oom_count=$(num "$(dmesg 2>/dev/null | grep -c 'consider tuning tcp_mem' || true)")
  oom_source='dmesg 全量（无 journalctl，数值含开机以来的历史）'
fi
if [ "${oom_count:-0}" -gt 0 ]; then
  fail "内核报告 TCP 内存耗尽 ${oom_count} 次（${oom_source}）：有连接被内核 RST"
else
  say "[ OK ] 内核未报告 TCP 内存耗尽（${oom_source:-无可用日志源}）"
fi

# 2) 内核 TCP 内存占用 / 上限
#    单位：sockstat 的 mem 与 tcp_mem 都是 4KB 页（x86_64），可直接相除；
#    64KB 页的 ARM 机器比值要除以 16。
sockstat_line=$(grep '^TCP:' /proc/net/sockstat 2>/dev/null | head -1 || true)
mem_4k=''
[ -n "$sockstat_line" ] && mem_4k=$(num "$(printf '%s\n' "$sockstat_line" | awk '{for (i=1;i<NF;i++) if ($i=="mem") print $(i+1)}')")
read -r tcp_mem_low tcp_mem_pressure tcp_mem_hard <<<"$(cat /proc/sys/net/ipv4/tcp_mem 2>/dev/null || echo '')"
[ -n "${tcp_mem_low:-}" ] && tcp_mem_low=$(num "$tcp_mem_low")
[ -n "${tcp_mem_pressure:-}" ] && tcp_mem_pressure=$(num "$tcp_mem_pressure")
[ -n "${tcp_mem_hard:-}" ] && tcp_mem_hard=$(num "$tcp_mem_hard")
tcp_mem_hard=${tcp_mem_hard:-0}
if [ -n "$mem_4k" ] && [ "$tcp_mem_hard" -gt 0 ]; then
  ratio=$(( mem_4k * 100 / tcp_mem_hard ))
  mem_mb=$(( mem_4k * 4 / 1024 ))
  limit_mb=$(( tcp_mem_hard * 4 / 1024 ))
  if [ "$ratio" -ge "$MEM_RATIO_FAIL" ]; then
    fail "内核 TCP 内存已用 ${mem_mb}MB / 上限 ${limit_mb}MB（${ratio}%）"
  elif [ "$ratio" -ge "$MEM_RATIO_WARN" ]; then
    warn "内核 TCP 内存已用 ${mem_mb}MB / 上限 ${limit_mb}MB（${ratio}%）"
  else
    say "[ OK ] 内核 TCP 内存 ${mem_mb}MB / 上限 ${limit_mb}MB（${ratio}%）"
  fi
  # 高水位（tcp_mem 第二个数）以上，内核就开始对新的缓冲区分配施压了
  if [ -n "${tcp_mem_pressure:-}" ] && [ "$mem_4k" -ge "$tcp_mem_pressure" ]; then
    warn "已越过 tcp_mem 高水位（mem ${mem_4k} >= pressure ${tcp_mem_pressure} 页）"
  fi
else
  say "[ -- ] 读不到 sockstat / tcp_mem，跳过内存占比检查"
fi
say "       ${sockstat_line:-（无 /proc/net/sockstat）}"
say "       tcp_mem = ${tcp_mem_low:-?} ${tcp_mem_pressure:-?} ${tcp_mem_hard:-?}（页，未读到则为 ?/0）"

# 3) 连接积压：Recv-Q 只涨不消就是「没人读那条连接」
if command -v ss >/dev/null 2>&1; then
  max_rq=$(num "$(ss -Htn 2>/dev/null | awk '{print $2}' | sort -n | tail -1)")
  over_warn=$(num "$(ss -Htn 2>/dev/null | awk -v t="$RECVQ_WARN" '$2 > t' | wc -l)")
  if [ "$max_rq" -ge "$RECVQ_FAIL" ]; then
    fail "最大 Recv-Q ${max_rq} 字节（>= ${RECVQ_FAIL}），有连接正在被压住不读"
  elif [ "$over_warn" -gt 0 ]; then
    warn "最大 Recv-Q ${max_rq} 字节，另有 ${over_warn} 条连接超过 ${RECVQ_WARN} 字节"
  else
    say "[ OK ] 最大 Recv-Q ${max_rq} 字节"
  fi
  if [ "$over_warn" -gt 0 ]; then
    say "       Recv-Q 最高的几条（本地/对端:端口 进程）："
    ss -Htnp 2>/dev/null | awk -v t="$RECVQ_WARN" '$2 > t' | sort -k2,2nr | head -5 | sed 's/^/       /'
  fi
  time_wait=$(num "$(ss -Htan 2>/dev/null | awk '$1 == "TIME-WAIT"' | wc -l)")
  if [ "$time_wait" -ge "$TIME_WAIT_WARN" ]; then
    warn "TIME-WAIT ${time_wait} 条（>= ${TIME_WAIT_WARN}）：短连接偏多"
  else
    say "[ OK ] TIME-WAIT ${time_wait:-0} 条"
  fi
else
  say '[ -- ] 没有 ss 命令，跳过连接检查（装 iproute：yum install -y iproute / apt install -y iproute2）'
fi

# 4) TcpAbortOnMemory 增量：内核因为内存不足掐掉的连接数，涨了就说明正在发生
abort_now=$(awk '
  /^TcpExt:/ {
    if (seen) { for (i = 2; i <= NF; i++) if (name[i] == "TCPAbortOnMemory") print $i; exit }
    for (i = 2; i <= NF; i++) name[i] = $i
    seen = 1
  }
' /proc/net/netstat 2>/dev/null | head -1)
if [ -n "${abort_now:-}" ]; then
  abort_now=$(num "$abort_now")
  abort_prev=0
  [ -f "$STATE_FILE" ] && abort_prev=$(num "$(cat "$STATE_FILE" 2>/dev/null || echo 0)")
  abort_delta=$(( abort_now - abort_prev ))
  printf '%s\n' "$abort_now" > "$STATE_FILE" 2>/dev/null || true
  if [ "$abort_delta" -gt 0 ]; then
    warn "TcpAbortOnMemory +${abort_delta}（累计 ${abort_now}）：刚有连接因 TCP 内存不足被 RST"
  else
    say "[ OK ] TcpAbortOnMemory 累计 ${abort_now}（较上次 +0）"
  fi
fi

# 5) node 进程的文件描述符数量：只涨不落通常意味着连接没被回收
for pid in $(pgrep -f 'index\.cjs' 2>/dev/null | head -3); do
  fd_count=$(num "$(ls /proc/"$pid"/fd 2>/dev/null | wc -l)")
  if [ "$fd_count" -ge "$NODE_FD_WARN" ]; then
    warn "node(PID ${pid}) 打开 ${fd_count} 个 fd（>= ${NODE_FD_WARN}）"
  else
    say "[ OK ] node(PID ${pid}) 打开 ${fd_count} 个 fd"
  fi
done

# 6) 内存余量：TCP 缓冲区和用户进程抢的是同一份内存
mem_kb() { awk -v key="$1:" '$1 == key { print $2; exit }' /proc/meminfo 2>/dev/null; }
mem_available_mb=''
mem_available_raw=$(mem_kb MemAvailable)
[ -n "$mem_available_raw" ] && mem_available_mb=$(( $(num "$mem_available_raw") / 1024 ))
if [ -n "$mem_available_mb" ]; then
  swap_free_mb=$(( $(num "$(mem_kb SwapFree)") / 1024 ))
  swap_total_mb=$(( $(num "$(mem_kb SwapTotal)") / 1024 ))
  say "[  i ] MemAvailable ${mem_available_mb}MB，Swap 可用 ${swap_free_mb}MB / ${swap_total_mb}MB"
  if [ "$swap_total_mb" -gt 0 ] && [ "$swap_free_mb" -eq 0 ]; then
    warn "Swap 已用尽（${swap_total_mb}MB 全部占满）：内存压力已经很大"
  fi
fi

if [ "$FAILED" = 1 ]; then
  echo "[结果] 有 FAIL 项，请按上面提示处理（先看 ss -Htnp 里 Recv-Q 高的连接属于哪个进程）"
  exit 1
fi
if [ "$WARNED" = 1 ]; then
  echo "[结果] 有 WARN 项"
  [ "$ALERT_ON_WARN" = 1 ] && exit 1
  exit 0
fi
say '[结果] 全部正常'
exit 0
