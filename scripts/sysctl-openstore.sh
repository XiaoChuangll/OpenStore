#!/usr/bin/env bash
#
# OpenStore 服务器 TCP 内核参数建议值
#
# 用法（先在服务器上跑一遍看输出，确认无误再加 --apply）：
#   bash sysctl-openstore.sh                 # 只看不写（默认）
#   sudo bash sysctl-openstore.sh --apply    # 写入 /etc/sysctl.d/99-openstore-tcp.conf
#   sudo bash sysctl-openstore.sh --apply --set-tcp-mem   # 连 tcp_mem 一起固定（一般不需要）
#
# 不要照抄网上「16G 机器优化参数」里的 tcp_mem 数值（那是内核对 16GB 内存自动算出的值）。
#
set -uo pipefail

APPLY=0
SET_TCP_MEM=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --set-tcp-mem) SET_TCP_MEM=1 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "未知参数：$arg（可用：--apply / --set-tcp-mem）" >&2; exit 2 ;;
  esac
done

CONF_PATH='/etc/sysctl.d/99-openstore-tcp.conf'

# 读当前值（读不到就打印 ?）
cur() { sysctl -n "$1" 2>/dev/null | tr '\n' ' ' | sed 's/ *$//'; }

# —— 本机内存 & 内核自己的 tcp_mem 算法 ——
# net/ipv4/tcp.c: tcp_init_mem() = 「内存页数/16，再取 3/4、1、2 倍」，即 4.69% / 6.25% / 9.375%
total_kb=$(awk '/^MemTotal:/{print $2; exit}' /proc/meminfo 2>/dev/null || echo 0)
total_kb=${total_kb:-0}
pages=$(( total_kb / 4 ))
auto_low=$(( pages * 46875 / 1000000 ))
auto_pressure=$(( pages * 625 / 10000 ))
auto_hard=$(( auto_low * 2 ))
[ "$pages" -gt 0 ] || { echo '读不到 /proc/meminfo，无法计算内存相关的建议值' >&2; exit 3; }

mem_mb=$(( total_kb / 1024 ))
echo "== 本机内存 ${mem_mb}MB（${pages} 页 4KB）=="
echo "   内核按这份内存自动算出的 tcp_mem 会是：${auto_low} ${auto_pressure} ${auto_hard}（页）"
echo "   折合约 $(( auto_low * 4 / 1024 ))MB / $(( auto_pressure * 4 / 1024 ))MB / $(( auto_hard * 4 / 1024 ))MB"

current_tcp_mem=$(cur net.ipv4.tcp_mem)
echo "   当前 tcp_mem = ${current_tcp_mem:-?}"
echo "   当前 tcp_rmem = $(cur net.ipv4.tcp_rmem)"
echo "   当前 tcp_wmem = $(cur net.ipv4.tcp_wmem)"
echo "   当前 tcp_mem 的手工配置来源（应为空）："
grep -rn 'tcp_mem' /etc/sysctl.conf /etc/sysctl.d/ 2>/dev/null | sed 's/^/     /' || true
echo

hard_now=$(printf '%s' "$current_tcp_mem" | awk '{print $3}')
if [ -n "${hard_now:-}" ] && [ "$hard_now" -gt 0 ] && [ "$hard_now" -lt $(( auto_hard / 2 )) ]; then
  echo "[!] 当前 tcp_mem 硬上限（$hard_now 页）远小于内核按内存自动算出的值（$auto_hard 页），"
  echo "    多半是某个「优化脚本」把它写小了。"
  echo
fi

rmem_max=$(printf '%s' "$(cur net.ipv4.tcp_rmem)" | awk '{print $3}')
wmem_max=$(printf '%s' "$(cur net.ipv4.tcp_wmem)" | awk '{print $3}')
if [ -n "${rmem_max:-}" ] && [ "$rmem_max" -gt 16777216 ]; then
  echo "[!] tcp_rmem 上限被调到 ${rmem_max} 字节：这意味着单条卡住的连接可以占住十几 MB 内核内存。"
  echo "    默认值 6291456 已经够用，建议改回 net.ipv4.tcp_rmem = 4096 131072 6291456。"
  echo
fi
if [ -n "${wmem_max:-}" ] && [ "$wmem_max" -gt 16777216 ]; then
  echo "[!] tcp_wmem 上限被调到 ${wmem_max} 字节，同上，建议改回 4096 16384 4194304。"
  echo
fi

CONF_CONTENT="# OpenStore 运维建议值（由 scripts/sysctl-openstore.sh 生成）
# 说明：刻意不写 net.ipv4.tcp_mem，让内核按本机内存自动定。

# 出站连接复用端口：我们给上游请求配了 keep-alive 连接池，这条能让 TIME_WAIT 的端口被复用
net.ipv4.tcp_tw_reuse = 1
# 关闭后，复用的长连接不会因为空闲一会儿就又回到慢启动（配合 keep-alive 连接池）
net.ipv4.tcp_slow_start_after_idle = 0
# FIN_WAIT_2 的超时，缩短「半关闭但迟迟不关」的连接存活时间
net.ipv4.tcp_fin_timeout = 15
# TIME_WAIT 上限。默认 262144，小机器上没必要留这么多槽位
net.ipv4.tcp_max_tw_buckets = 30000
# 新建连接队列：nginx -> node 这一段属于本机回环/内网，给足
net.core.somaxconn = 2048
net.ipv4.tcp_max_syn_backlog = 2048
# 探测对端是否还活着：让死连接更早被收掉，而不是一直占着 socket
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 3
# 出站端口范围（长连接 + 高并发转发时够用）
net.ipv4.ip_local_port_range = 1024 65000
# SYN 洪水兜底（保持开启）
net.ipv4.tcp_syncookies = 1
"

if [ "$SET_TCP_MEM" = 1 ]; then
  CONF_CONTENT="${CONF_CONTENT}
# 固定 tcp_mem（数值 = 内核按本机 ${mem_mb}MB 内存会自动算出的那组）
net.ipv4.tcp_mem = ${auto_low} ${auto_pressure} ${auto_hard}
"
fi

if [ "$APPLY" != 1 ]; then
  echo '—— 以下是准备写入的内容（当前是预览模式，未改动任何文件）——'
  printf '%s\n' "$CONF_CONTENT"
  echo "—— 确认无误后执行：sudo bash $0 --apply ——"
  exit 0
fi

if [ ! -d /etc/sysctl.d ]; then
  echo '/etc/sysctl.d 不存在，这台机器可能不用 systemd-sysctl 管理参数，请手工写入 /etc/sysctl.conf' >&2
  exit 4
fi

if [ -f "$CONF_PATH" ]; then
  backup="${CONF_PATH}.bak.$(date +%Y%m%d%H%M%S)"
  cp -a "$CONF_PATH" "$backup" && echo "已备份旧文件到 ${backup}"
fi
printf '%s\n' "$CONF_CONTENT" > "$CONF_PATH"
echo "已写入 ${CONF_PATH}"

sysctl --system >/dev/null 2>&1 || sysctl -p "$CONF_PATH"
echo
echo "== 生效后的值 =="
echo "   tcp_mem   = $(cur net.ipv4.tcp_mem)"
echo "   tcp_tw_reuse = $(cur net.ipv4.tcp_tw_reuse)"
echo "   somaxconn = $(cur net.core.somaxconn)"
echo "   ip_local_port_range = $(cur net.ipv4.ip_local_port_range)"
echo
echo "回滚：删除 ${CONF_PATH} 后执行 sysctl --system（旧文件已备份）。"
