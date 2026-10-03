# 鸿蒙应用市场 第三方API

提供鸿蒙应用市场数据查询、统计分析等功能

- 版本 : `0.12.32`
- 基础地址 : `https://shenjack.top:10003`
- 文档源 : `/openapi.json`

## 使用须知

!> 现在所有请求均要求有一个非null user-agent

!> 使用者不得在获取信息之后在本地原样存储

!> 使用者不得使用该API获取的信息后声明为“华为官方数据”

如需使用帮助，欢迎加入QQ群：1104231298

## 接口列表

**应用查询**

- [`GET /api/v0/apps/app_id/{app_id}`](#根据应用id查询应用详细信息) : 根据应用ID查询应用详细信息
- [`GET /api/v0/apps/icon`](#获取应用图标url) : 获取应用图标URL
- [`GET /api/v0/apps/icon/content`](#通过本站转发数据库中记录的应用图标避免-wasm-图片加载受到第三方-cors-限制) : 通过本站转发数据库中记录的应用图标，避免 WASM 图片加载受到第三方 CORS 限制
- [`GET /api/v0/apps/list/{page_count}`](#分页获取应用列表支持多种排序和过滤选项) : 分页获取应用列表，支持多种排序和过滤选项
- [`GET /api/v0/apps/metrics/{pkg_id}`](#获取指定应用的下载量历史变化数据) : 获取指定应用的下载量历史变化数据
- [`GET /api/v0/apps/pkg_name/{pkg_name}`](#根据应用包名查询应用详细信息) : 根据应用包名查询应用详细信息
- [`POST /api/v0/apps/query`](#分页获取应用列表支持复杂搜索条件) : 分页获取应用列表，支持复杂搜索条件

**市场信息**

- [`GET /api/v0/dashboard/config`](#获取-dashboard-客户端显示配置) : 获取 Dashboard 客户端显示配置
- [`GET /api/v0/market_info`](#获取华为应用市场统计信息) : 获取华为应用市场统计信息
- [`GET /api/v0/sync_status/stream`](#sse流实时推送同步状态信息) : SSE流：实时推送同步状态信息

**排行榜**

- [`GET /api/v0/rankings/category_download_growth`](#大分类下载量增速排行) : 大分类下载量增速排行
- [`GET /api/v0/rankings/developers`](#获取开发者排行榜) : 获取开发者排行榜
- [`GET /api/v0/rankings/download_increase`](#获取应用下载量增长排行榜截止到今天) : 获取应用下载量增长排行榜（截止到今天）
- [`POST /api/v0/rankings/download_increase`](#使用高级搜索获取应用下载量增长排行榜) : 使用高级搜索获取应用下载量增长排行榜
- [`GET /api/v0/rankings/max_download`](#获取每日下载量最高的-app) : 获取每日下载量最高的 APP
- [`GET /api/v0/rankings/new_app_download_growth`](#新-app-下载量增速排行) : 新 APP 下载量增速排行
- [`GET /api/v0/rankings/rate_history`](#获取应用评分历史数据) : 获取应用评分历史数据
- [`GET /api/v0/rankings/ratings`](#获取评分排行榜) : 获取评分排行榜
- [`GET /api/v0/rankings/recent`](#获取最近更新应用排行榜) : 获取最近更新应用排行榜
- [`GET /api/v0/rankings/segment_download_growth`](#细分赛道下载量增速排行) : 细分赛道下载量增速排行

**统计图表**

- [`GET /api/v0/charts/api_history`](#获取-harmony-api-级别历史分布数据) : 获取 Harmony API 级别历史分布数据
- [`POST /api/v0/charts/min_sdk`](#获取应用最低支持-sdk-版本分布统计get-post) : 获取应用最低支持 SDK 版本分布统计（GET / POST）
- [`POST /api/v0/charts/rating`](#获取应用星级评分分布统计get-post) : 获取应用星级评分分布统计（GET / POST）
- [`POST /api/v0/charts/target_sdk`](#获取应用目标-sdk-版本分布统计get-post) : 获取应用目标 SDK 版本分布统计（GET / POST）

**应用提交**

- [`POST /api/v0/submit`](#提交应用信息需要提供app_id或pkg_name) : 提交应用信息，需要提供app_id或pkg_name
- [`POST /api/v0/submit_substance/{substance_id}`](#提交专题信息) : 提交专题信息

**专题查询**

- [`GET /api/v0/substance/list/{page}`](#分页获取专题列表-分页获取专题列表) : 分页获取专题列表 分页获取专题列表
- [`GET /api/v0/substance/{substance_id}`](#根据-substance_id-查询专题信息) : 根据 substance_id 查询专题信息

**飞书集成**

- [`GET /api/v0/feishu/meta.json`](#获取飞书数据连接器元信息) : 获取飞书数据连接器元信息
- [`POST /api/v0/feishu/records`](#获取飞书记录) : 获取飞书记录
- [`POST /api/v0/feishu/table_meta`](#获取飞书表格元信息) : 获取飞书表格元信息

## 接口文档

### 应用查询

#### 根据应用ID查询应用详细信息

说明 : 该接口优先返回数据库中的现有数据，仅在数据库无记录时查询华为应用市场。

应用ID是华为应用市场为每个应用分配的唯一标识符。

**必选参数 :**

`app_id` : 华为应用市场的应用ID，例如：C10084839

**可选参数 :**

`use_cache` : 是否优先使用数据库缓存；即使为 false，短时间内的同步节流缓存仍然生效。

**接口地址 :** `GET /api/v0/apps/app_id/{app_id}`

**调用例子 :** `/api/v0/apps/app_id/C1164531384803416384?use_cache=xxx`

---

#### 获取应用图标URL

**可选参数 :**

`app_id` : 应用 ID

`pkg_name` : 包名

**接口地址 :** `GET /api/v0/apps/icon`

**调用例子 :** `/api/v0/apps/icon?app_id=xxx`

---

#### 通过本站转发数据库中记录的应用图标，避免 WASM 图片加载受到第三方 CORS 限制

说明 : 通过本站转发数据库中记录的应用图标，避免 WASM 图片加载受到第三方 CORS 限制。

**可选参数 :**

`app_id` : 应用 ID

`pkg_name` : 包名

**接口地址 :** `GET /api/v0/apps/icon/content`

**调用例子 :** `/api/v0/apps/icon/content?app_id=xxx`

---

#### 分页获取应用列表，支持多种排序和过滤选项

说明 : 路径参数说明：


- `page_count`: 页码，1-based；传入 `0` 会按第 1 页处理
查询参数说明：

- `page_size`: 每页数量，默认值由 `AppListQuery` 决定，最大值受系统限制
- `detail`: 是否返回详细信息，`true` 返回完整信息，`false` 返回简要信息
- `sort`: 排序字段，实际支持范围以 `AppListQuery::is_valid_sort()` 为准
- `desc`: 是否降序排序，默认 `false`
- `search_key`: 搜索字段，实际支持范围以 `AppListQuery::is_valid_search()` 为准
- `search_value`: 搜索值
- `search_exact`: 是否精确匹配
- `search_not_null`: 搜索时是否排除空值
- `exclude_huawei`: 是否排除华为官方应用
- `exclude_atomic`: 是否排除原子化服务

**必选参数 :**

`page_count` : 页码，1-based；0 会按第 1 页处理

**可选参数 :**

`sort` : 排序字段

`desc` : 是否降序

`search_key` : 搜索字段名称

`search_value` : 搜索字段的值

`search_exact` : 是否精确匹配

`search_not_null` : 搜索时是否排除空值

`page_size` : 每页大小

`detail` : 返回详细信息（true）或简略信息（false）

`exclude_huawei` : 是否排除华为来源应用

`exclude_atomic` : 是否排除原子化应用

**接口地址 :** `GET /api/v0/apps/list/{page_count}`

**调用例子 :** `/api/v0/apps/list/1?sort=xxx`

---

#### 获取指定应用的下载量历史变化数据

说明 : 返回指定应用的历史下载量记录，用于绘制下载量趋势图。

数据来源于定期同步时记录的下载量快照。

**必选参数 :**

`pkg_id` : 应用包名，例如：com.huawei.music

**接口地址 :** `GET /api/v0/apps/metrics/{pkg_id}`

**调用例子 :** `/api/v0/apps/metrics/C1164531384803416384`

---

#### 根据应用包名查询应用详细信息

说明 : 该接口优先返回数据库中的现有数据，仅在数据库无记录时查询华为应用市场。

返回的数据包括：应用基础信息、版本信息、评分、下载量、开发者信息等。

**必选参数 :**

`pkg_name` : 应用包名，例如：com.huawei.music

**可选参数 :**

`use_cache` : 是否优先使用数据库缓存；即使为 false，短时间内的同步节流缓存仍然生效。

**接口地址 :** `GET /api/v0/apps/pkg_name/{pkg_name}`

**调用例子 :** `/api/v0/apps/pkg_name/com.huawei.hmsapp.appgallery?use_cache=xxx`

---

#### 分页获取应用列表，支持复杂搜索条件

说明 : 查询参数说明：


- `page`: 页码，1-based；传入 `0` 会按第 1 页处理
- `page_size`: 每页数量，默认 100
- `detail`: 是否返回详细信息，`true` 返回完整信息，`false` 返回简要信息
- `sort`: 排序字段，实际支持范围以 `AppQueryListQuery::is_valid_sort()` 为准
- `desc`: 是否降序排序，默认 `false`
请求体（可选）：`SearchExpression` 搜索表达式，支持 AND/OR 嵌套逻辑。
示例：

```json
{ "and": [
    { "key": "name", "value": "游戏", "op": "ilike" },
    { "key": "rating", "value": "4.0", "op": "gte" }
]}
```

**可选参数 :**

`page` : 页码（1-based）

`sort` : 排序字段

`desc` : 是否降序

`page_size` : 每页大小

`detail` : 返回详细信息（true）或简略信息（false）

**请求体 :**

搜索表达式，支持 AND/OR 嵌套逻辑, 参考 ApiSearchExpression

结构参考附录：「ApiSearchExpression」

**接口地址 :** `POST /api/v0/apps/query`

**调用例子 :** `POST /api/v0/apps/query`

---

### 市场信息

#### 获取 Dashboard 客户端显示配置

说明 : 原生客户端按此配置决定是否请求并显示下载量相关区块。配置请求失败时，

客户端应采用隐藏敏感指标的保守默认值。

**接口地址 :** `GET /api/v0/dashboard/config`

**调用例子 :** `/api/v0/dashboard/config`

---

#### 获取华为应用市场统计信息

说明 : 该接口返回数据库中收录的应用市场统计数据，包括：


- app_count: 应用数量统计
- substance_count: 专题数量
- developer_count: 开发者数量
- page_size_max: 分页查询的最大页面大小
- sync_status: 当前同步状态
- crate_version: 服务版本号
- user_agent: 请求华为API使用的User-Agent

**接口地址 :** `GET /api/v0/market_info`

**调用例子 :** `/api/v0/market_info`

---

#### SSE流：实时推送同步状态信息

**接口地址 :** `GET /api/v0/sync_status/stream`

**调用例子 :** `/api/v0/sync_status/stream`

---

### 排行榜

#### 大分类下载量增速排行

说明 : 按应用分类（kind_id/kind_name）聚合窗口内的下载量增量。

结果带内存 TTL 缓存，缓存周期与 `[api].interval_seconds` 一致；
缓存未命中或过期时才查询数据库，数据库失败时优先返回旧缓存。

**可选参数 :**

`days` : 统计窗口天数，默认 7

`limit` : 返回限制，默认 50

`page` : 分页页码，1-based，默认 1

`min_apps` : 最小赛道 APP 数，默认 1

**接口地址 :** `GET /api/v0/rankings/category_download_growth`

**调用例子 :** `/api/v0/rankings/category_download_growth?days=xxx`

---

#### 获取开发者排行榜

说明 : 返回发布应用数量最多的开发者列表，按照应用数量降序排序。

可通过limit参数控制返回数量，默认返回前10个开发者。
返回数据包括开发者名称和其发布的应用数量。

**可选参数 :**

`limit` : 最大返回数量 / 每页条数

`page` : 页码（1-based），为 None 时不分页

`exclude_pattern` : 排除的包名模式

`time_range` : 时间范围，例如 "7d", "30d"

**接口地址 :** `GET /api/v0/rankings/developers`

**调用例子 :** `/api/v0/rankings/developers?limit=xxx`

---

#### 获取应用下载量增长排行榜（截止到今天）

说明 : 比较上海时区今天与 today - interval 的下载量状态，默认比较今天和昨天；不会回退到最近一个有数据的 metric_date，因此如果今天还没有写入下载状态，返回空结果是符合预期的。


**可选参数 :**

`months` : 月数间隔；与上海时区“今天”一起组成比较窗口，默认 `0`。

`days` : 天数间隔；默认 `1`。不传 `days` / `months` 时比较“今天 vs 昨天”。

`limit` : 返回限制，默认 `100`。

`listed_days` : 仅保留最近多少天内上架的应用。

`listed_months` : 仅保留最近多少月内上架的应用。

`page` : 分页页码，1-based，默认 `1`。

`exclude_huawei` : 是否排除华为来源应用，默认 `false`。

`exclude_atomic` : 是否排除原子化应用，默认 `false`。

**接口地址 :** `GET /api/v0/rankings/download_increase`

**调用例子 :** `/api/v0/rankings/download_increase?months=xxx`

---

#### 使用高级搜索获取应用下载量增长排行榜

说明 : 查询参数、分页、排序和返回明细与 GET 相同。请求体复用应用高级搜索表达式，并额外支持 download_increment；该字段只能是根条件或最外层 AND 的直属条件。空 body、null、{}、根级空 AND/OR 均表示不使用高级筛选。


**可选参数 :**

`months` : 月数间隔；与上海时区“今天”一起组成比较窗口，默认 `0`。

`days` : 天数间隔；默认 `1`。不传 `days` / `months` 时比较“今天 vs 昨天”。

`limit` : 返回限制，默认 `100`。

`listed_days` : 仅保留最近多少天内上架的应用。

`listed_months` : 仅保留最近多少月内上架的应用。

`page` : 分页页码，1-based，默认 `1`。

`exclude_huawei` : 是否排除华为来源应用，默认 `false`。

`exclude_atomic` : 是否排除原子化应用，默认 `false`。

**请求体 :**

可选高级搜索表达式。普通字段在 app_full_info 上预先筛选；download_increment 仅支持 eq/ne/gt/gte/lt/lte 和 i64 字符串值。

结构参考附录：「ApiSearchExpression」

**接口地址 :** `POST /api/v0/rankings/download_increase`

**调用例子 :** `POST /api/v0/rankings/download_increase`

---

#### 获取每日下载量最高的 APP

说明 : 返回来自物化视图 `mv_daily_top_app_metrics` 的每日下载量最高的应用列表。

不接受分页或 limit 参数，返回全部记录，response 的 total 与 limit 都等于返回列表长度。

**接口地址 :** `GET /api/v0/rankings/max_download`

**调用例子 :** `/api/v0/rankings/max_download`

---

#### 新 APP 下载量增速排行

说明 : "新 APP" 定义为当前下载量处于 `[min_downloads, max_downloads)` 区间内的应用。

`level` 为 `category` 时按大分类聚合，否则（含非法值）按细分赛道聚合。
结果带内存 TTL 缓存，缓存周期与 `[api].interval_seconds` 一致。

**可选参数 :**

`days` : 统计窗口天数，默认 7

`limit` : 返回限制，默认 50

`page` : 分页页码，1-based，默认 1

`min_apps` : 最小赛道新 APP 数，默认 5

`min_downloads` : 当前下载量下限，默认 1000

`max_downloads` : 当前下载量上限，默认 100000，使用小于该值

`level` : 聚合粒度，可选 segment 或 category，默认 segment

**接口地址 :** `GET /api/v0/rankings/new_app_download_growth`

**调用例子 :** `/api/v0/rankings/new_app_download_growth?days=xxx`

---

#### 获取应用评分历史数据

说明 : 返回指定应用的每日评分统计历史数据，包括每日新增评分数、平均分等信息。

必须提供 app_id 或 pkg_name 其中之一作为查询参数。

**可选参数 :**

`app_id` : 应用 ID

`pkg_name` : 包名

**接口地址 :** `GET /api/v0/rankings/rate_history`

**调用例子 :** `/api/v0/rankings/rate_history?app_id=xxx`

---

#### 获取评分排行榜

说明 : 返回评分最高的应用列表，按照评分（rating）降序排序。

可通过limit参数控制返回数量，默认返回前10个应用。

**可选参数 :**

`limit` : 最大返回数量 / 每页条数

`page` : 页码（1-based），为 None 时不分页

`exclude_pattern` : 排除的包名模式

`time_range` : 时间范围，例如 "7d", "30d"

**接口地址 :** `GET /api/v0/rankings/ratings`

**调用例子 :** `/api/v0/rankings/ratings?limit=xxx`

---

#### 获取最近更新应用排行榜

说明 : 返回最近更新的应用列表，按照更新时间（updated_at）降序排序。

可通过limit参数控制返回数量，默认返回前10个应用。

**可选参数 :**

`limit` : 最大返回数量 / 每页条数

`page` : 页码（1-based），为 None 时不分页

`exclude_pattern` : 排除的包名模式

`time_range` : 时间范围，例如 "7d", "30d"

**接口地址 :** `GET /api/v0/rankings/recent`

**调用例子 :** `/api/v0/rankings/recent?limit=xxx`

---

#### 细分赛道下载量增速排行

说明 : 按应用分类（kind_id/kind_name）+ 细分标签（tag_name，空时回退 kind_name）聚合窗口内的下载量增量。

结果带内存 TTL 缓存，缓存周期与 `[api].interval_seconds` 一致。

**可选参数 :**

`days` : 统计窗口天数，默认 7

`limit` : 返回限制，默认 50

`page` : 分页页码，1-based，默认 1

`min_apps` : 最小赛道 APP 数，默认 5

**接口地址 :** `GET /api/v0/rankings/segment_download_growth`

**调用例子 :** `/api/v0/rankings/segment_download_growth?days=xxx`

---

### 统计图表

#### 获取 Harmony API 级别历史分布数据

说明 : 返回数据库中记录的每日 API 级别分布比例。

数据格式为按日期排序的列表，每项包含日期以及对应的 API 级别比例映射。

**接口地址 :** `GET /api/v0/charts/api_history`

**调用例子 :** `/api/v0/charts/api_history`

---

#### 获取应用最低支持 SDK 版本分布统计（GET / POST）

说明 : 返回数据库中应用的最低支持 SDK 版本（`minsdk`）分布情况。


- `GET`：获取全量分布统计
- `POST`：可附带搜索表达式，仅统计匹配结果

**请求体 :**

可选搜索表达式；GET 请求通常不带请求体，POST 请求可携带 AND/OR 嵌套逻辑表达式

结构参考附录：「ApiSearchExpression」

**接口地址 :** `POST /api/v0/charts/min_sdk`

**调用例子 :** `POST /api/v0/charts/min_sdk`

---

#### 获取应用星级评分分布统计（GET / POST）

说明 : 返回数据库中应用的 1 星到 5 星评分分布。


- `GET`：获取全量分布统计
- `POST`：可附带搜索表达式，仅统计匹配结果

**请求体 :**

可选搜索表达式；GET 请求通常不带请求体，POST 请求可携带 AND/OR 嵌套逻辑表达式

结构参考附录：「ApiSearchExpression」

**接口地址 :** `POST /api/v0/charts/rating`

**调用例子 :** `POST /api/v0/charts/rating`

---

#### 获取应用目标 SDK 版本分布统计（GET / POST）

说明 : 返回数据库中应用的目标 SDK 版本（`target_sdk`）分布情况。


- `GET`：获取全量分布统计
- `POST`：可附带搜索表达式，仅统计匹配结果

**请求体 :**

可选搜索表达式；GET 请求通常不带请求体，POST 请求可携带 AND/OR 嵌套逻辑表达式

结构参考附录：「ApiSearchExpression」

**接口地址 :** `POST /api/v0/charts/target_sdk`

**调用例子 :** `POST /api/v0/charts/target_sdk`

---

### 应用提交

#### 提交应用信息，需要提供app_id或pkg_name

**请求体 :**

**接口地址 :** `POST /api/v0/submit`

**调用例子 :** `POST /api/v0/submit`

---

#### 提交专题信息

说明 : 从华为应用市场获取指定专题的信息，并自动获取其关联的所有应用数据。

如果数据库中不存在该专题，会将其保存到数据库。
同时会同步所有关联的应用信息。

**必选参数 :**

`substance_id` : 专题ID，例如：05998b06c4aa47469b2f26586bec699c

**请求体 :**

请求体可选，支持comment字段添加备注信息

**接口地址 :** `POST /api/v0/submit_substance/{substance_id}`

**调用例子 :** `POST /api/v0/submit_substance/{substance_id}`

---

### 专题查询

#### 分页获取专题列表 分页获取专题列表

说明 : 路径参数 `page` 是 1-based；传入 `0` 会按第 1 页处理。


**必选参数 :**

`page` : 页码，1-based；0 会按第 1 页处理

**可选参数 :**

`sort` : 排序字段

`desc` : 是否降序

`page_size` : 每页大小

**接口地址 :** `GET /api/v0/substance/list/{page}`

**调用例子 :** `/api/v0/substance/list/1?sort=xxx`

---

#### 根据 substance_id 查询专题信息

说明 : 根据 substance_id 查询专题信息

**必选参数 :**

`substance_id` : 专题ID

**接口地址 :** `GET /api/v0/substance/{substance_id}`

**调用例子 :** `/api/v0/substance/1`

---

### 飞书集成

#### 获取飞书数据连接器元信息

**接口地址 :** `GET /api/v0/feishu/meta.json`

**调用例子 :** `/api/v0/feishu/meta.json`

---

#### 获取飞书记录

**接口地址 :** `POST /api/v0/feishu/records`

**调用例子 :** `POST /api/v0/feishu/records`

---

#### 获取飞书表格元信息

**接口地址 :** `POST /api/v0/feishu/table_meta`

**调用例子 :** `POST /api/v0/feishu/table_meta`

---

## 返回格式

所有接口统一返回 `ApiResponse`：

```json
{
  "success": true,
  "data": {},
  "total": 100,
  "limit": 20,
  "timestamp": "2026-10-03T00:00:00Z"
}
```

`data` : 返回的数据，通常为任意 JSON 值（必返）

`limit` : 可选的分页限制（用于分页）（可选）

`success` : 请求是否成功（必返）

`timestamp` : 响应生成时间戳（UTC）（必返）

`total` : 可选的总条目数（用于分页）（可选）

## 附录：搜索表达式 ApiSearchExpression

搜索表达式（支持嵌套的 AND/OR 逻辑）
(仅用于 openapi 生成文档, 无实际作用)

**示例 JSON**

单个条件:

```json
{ "key": "name", "value": "test", "op": "like" }
```

AND 组合:

```json
{ "and": [
    { "key": "name", "value": "test", "op": "like" },
    { "key": "developer_name", "value": "华为", "op": "eq" }
]}
```

OR 组合:

```json
{ "or": [
    { "key": "name", "value": "test", "op": "like" },
    { "key": "name", "value": "游戏", "op": "like" }
]}
```

嵌套组合 (A AND B) OR C:

```json
{ "or": [
    { "and": [
        { "key": "name", "value": "test", "op": "like" },
        { "key": "developer_name", "value": "华为", "op": "eq" }
    ]},
    { "key": "pkg_name", "value": "com.example", "op": "like" }
]}
```

数组字段包含查询:

```json
{ "key": "main_device_codes", "value": "phone,tablet", "op": "array_contains" }
```

数组字段交集查询（JSON 数组格式）:

```json
{ "key": "main_device_codes", "value": "[\"phone\",\"tablet\"]", "op": "array_overlaps" }
```

### SearchCondition

单个搜索条件

`key` : 搜索字段名称（必填）

`op` : 搜索操作符，默认为 ilike（可选）

`value` : 搜索值（对于 is_null/is_not_null 可以为空） 对于数组操作符（`array_contains` / `array_overlaps` / `array_contained_by`）， 可以传入逗号分隔的字符串（`"a,b,c"`）或 JSON 数组字符串（`["a","b","c"]`）。（可选）
