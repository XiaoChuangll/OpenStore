{
  "openapi": "3.1.0",
  "info": {
    "title": "鸿蒙应用市场 第三方API",
    "description": "鸿蒙应用市场 第三方API\n\n提供鸿蒙应用市场数据查询、统计分析等功能\n\n使用者不得在获取信息之后在本地原样存储",
    "contact": {
      "name": "shenjackyuanjie",
      "email": "3695888@qq.com"
    },
    "license": {
      "name": "GPL-3.0",
      "identifier": "GPL-3.0"
    },
    "version": "0.10.11"
  },
  "paths": {
    "/api/v0/apps/app_id/{app_id}": {
      "get": {
        "tags": [
          "应用查询"
        ],
        "summary": "根据应用ID查询应用详细信息",
        "description": "该接口会优先从华为应用市场获取最新数据，如果获取失败则返回数据库中的历史数据。\n应用ID是华为应用市场为每个应用分配的唯一标识符。",
        "operationId": "query_app_id",
        "parameters": [
          {
            "name": "app_id",
            "in": "path",
            "description": "华为应用市场的应用ID，例如：C10084839",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "如果在线获取失败，则返回数据库中的现有数据"
          }
        }
      }
    },
    "/api/v0/apps/icon": {
      "get": {
        "tags": [
          "应用查询"
        ],
        "operationId": "get_app_icon",
        "parameters": [
          {
            "name": "app_id",
            "in": "query",
            "description": "应用 ID",
            "required": false,
            "schema": {
              "type": [
                "string",
                "null"
              ]
            }
          },
          {
            "name": "pkg_name",
            "in": "query",
            "description": "包名",
            "required": false,
            "schema": {
              "type": [
                "string",
                "null"
              ]
            }
          }
        ],
        "responses": {
          "200": {
            "description": "获取应用图标URL",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ApiResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/v0/apps/list/{page_count}": {
      "get": {
        "tags": [
          "应用查询"
        ],
        "summary": "分页获取应用列表，支持多种排序和过滤选项",
        "description": "查询参数说明：\n- page_size: 每页数量，默认50，最大值受系统限制\n- detail: 是否返回详细信息，true返回完整信息，false返回简要信息\n- sort: 排序字段，支持：rating（评分）、downloads（下载量）、updated_at（更新时间）等\n- desc: 是否降序排序，默认false\n- search: 搜索关键词\n- search_key: 搜索字段，支持：name（应用名）、pkg_name（包名）、developer（开发者）等\n- exclude_huawei: 是否排除华为官方应用\n- exclude_atomic: 是否排除原子化服务",
        "operationId": "app_list_paged",
        "parameters": [
          {
            "name": "page_count",
            "in": "path",
            "description": "页码，从0开始",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "sort",
            "in": "query",
            "description": "排序字段",
            "required": false,
            "schema": {
              "type": [
                "string",
                "null"
              ]
            }
          },
          {
            "name": "desc",
            "in": "query",
            "description": "是否降序",
            "required": false,
            "schema": {
              "type": [
                "boolean",
                "null"
              ]
            }
          },
          {
            "name": "search_key",
            "in": "query",
            "description": "搜索字段名称",
            "required": false,
            "schema": {
              "type": [
                "string",
                "null"
              ]
            }
          },
          {
            "name": "search_value",
            "in": "query",
            "description": "搜索字段的值",
            "required": false,
            "schema": {
              "type": [
                "string",
                "null"
              ]
            }
          },
          {
            "name": "search_exact",
            "in": "query",
            "description": "是否精确匹配",
            "required": false,
            "schema": {
              "type": [
                "boolean",
                "null"
              ]
            }
          },
          {
            "name": "search_not_null",
            "in": "query",
            "description": "搜索时是否排除空值",
            "required": false,
            "schema": {
              "type": [
                "boolean",
                "null"
              ]
            }
          },
          {
            "name": "page_size",
            "in": "query",
            "description": "每页大小",
            "required": false,
            "schema": {
              "type": [
                "integer",
                "null"
              ],
              "format": "int32",
              "minimum": 0
            }
          },
          {
            "name": "detail",
            "in": "query",
            "description": "返回详细信息（true）或简略信息（false）",
            "required": false,
            "schema": {
              "type": [
                "boolean",
                "null"
              ]
            }
          },
          {
            "name": "exclude_huawei",
            "in": "query",
            "description": "是否排除华为来源应用",
            "required": false,
            "schema": {
              "type": [
                "boolean",
                "null"
              ]
            }
          },
          {
            "name": "exclude_atomic",
            "in": "query",
            "description": "是否排除原子化应用",
            "required": false,
            "schema": {
              "type": [
                "boolean",
                "null"
              ]
            }
          }
        ],
        "responses": {
          "200": {
            "description": "返回数据包含total_count（总数）和page_size（每页数量）"
          }
        }
      }
    },
    "/api/v0/apps/metrics/{pkg_id}": {
      "get": {
        "tags": [
          "应用查询"
        ],
        "summary": "获取指定应用的下载量历史变化数据",
        "description": "返回指定应用的历史下载量记录，用于绘制下载量趋势图。\n数据来源于定期同步时记录的下载量快照。",
        "operationId": "get_app_download_history",
        "parameters": [
          {
            "name": "pkg_id",
            "in": "path",
            "description": "应用包名，例如：com.huawei.music",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "数据按时间序列排列，包含每次记录的下载量和时间戳"
          }
        }
      }
    },
    "/api/v0/apps/pkg_name/{pkg_name}": {
      "get": {
        "tags": [
          "应用查询"
        ],
        "summary": "根据应用包名查询应用详细信息",
        "description": "该接口会优先从华为应用市场获取最新数据，如果获取失败则返回数据库中的历史数据。\n返回的数据包括：应用基础信息、版本信息、评分、下载量、开发者信息等。",
        "operationId": "query_pkg",
        "parameters": [
          {
            "name": "pkg_name",
            "in": "path",
            "description": "应用包名，例如：com.huawei.music",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "如果在线获取失败，则返回数据库中的现有数据"
          }
        }
      }
    },
    "/api/v0/apps/query": {
      "post": {
        "tags": [
          "应用查询"
        ],
        "summary": "分页获取应用列表，支持复杂搜索条件",
        "description": "查询参数说明：\n- page: 页码，从0开始，默认0\n- page_size: 每页数量，默认100\n- detail: 是否返回详细信息，true返回完整信息，false返回简要信息\n- sort: 排序字段，支持：rating（评分）、downloads（下载量）、updated_at（更新时间）等\n- desc: 是否降序排序，默认false\n\n请求体（可选）：SearchExpression 搜索表达式，支持 AND/OR 嵌套逻辑\n示例：\n```json\n{ \"and\": [\n    { \"key\": \"name\", \"value\": \"游戏\", \"op\": \"ilike\" },\n    { \"key\": \"rating\", \"value\": \"4.0\", \"op\": \"gte\" }\n]}\n```",
        "operationId": "app_list_query",
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "description": "页码（从0开始）",
            "required": false,
            "schema": {
              "type": [
                "integer",
                "null"
              ],
              "format": "int32",
              "minimum": 0
            }
          },
          {
            "name": "sort",
            "in": "query",
            "description": "排序字段",
            "required": false,
            "schema": {
              "type": [
                "string",
                "null"
              ]
            }
          },
          {
            "name": "desc",
            "in": "query",
            "description": "是否降序",
            "required": false,
            "schema": {
              "type": [
                "boolean",
                "null"
              ]
            }
          },
          {
            "name": "page_size",
            "in": "query",
            "description": "每页大小",
            "required": false,
            "schema": {
              "type": [
                "integer",
                "null"
              ],
              "format": "int32",
              "minimum": 0
            }
          },
          {
            "name": "detail",
            "in": "query",
            "description": "返回详细信息（true）或简略信息（false）",
            "required": false,
            "schema": {
              "type": [
                "boolean",
                "null"
              ]
            }
          }
        ],
        "requestBody": {
          "description": "搜索表达式，支持 AND/OR 嵌套逻辑, 参考 ApiSearchExpression",
          "content": {
            "application/json": {
              "schema": {
                "oneOf": [
                  {
                    "type": "null"
                  },
                  {
                    "$ref": "#/components/schemas/ApiSearchExpression"
                  }
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "返回数据包含total_count（总数）和page_size（每页数量）"
          }
        }
      }
    },
    "/api/v0/charts/min_sdk": {
      "post": {
        "tags": [
          "统计图表"
        ],
        "summary": "获取应用最低支持SDK版本分布统计（POST）",
        "description": "返回数据库中所有应用的最低支持SDK版本（minSdkVersion）分布情况。\n统计数据以SDK版本号为键，应用数量为值。\n用于了解开发者对不同Android版本的支持情况。",
        "operationId": "get_min_sdk_distribution",
        "requestBody": {
          "description": "搜索表达式，支持 AND/OR 嵌套逻辑, 参考 ApiSearchExpression",
          "content": {
            "application/json": {
              "schema": {
                "oneOf": [
                  {
                    "type": "null"
                  },
                  {
                    "$ref": "#/components/schemas/ApiSearchExpression"
                  }
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "成功返回各SDK版本的应用数量分布",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ApiResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/v0/charts/rating": {
      "post": {
        "tags": [
          "统计图表"
        ],
        "summary": "获取应用星级评分分布统计（POST）",
        "description": "返回数据库中所有应用的星级评分分布情况，统计1星到5星各个评分区间的应用数量。\n用于生成评分分布图表或进行数据分析。",
        "operationId": "get_rating_distribution",
        "requestBody": {
          "description": "搜索表达式，支持 AND/OR 嵌套逻辑, 参考 ApiSearchExpression",
          "content": {
            "application/json": {
              "schema": {
                "oneOf": [
                  {
                    "type": "null"
                  },
                  {
                    "$ref": "#/components/schemas/ApiSearchExpression"
                  }
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "返回格式：{\"star_1\": 数量, \"star_2\": 数量, \"star_3\": 数量, \"star_4\": 数量, \"star_5\": 数量}"
          }
        }
      }
    },
    "/api/v0/charts/target_sdk": {
      "post": {
        "tags": [
          "统计图表"
        ],
        "summary": "获取应用目标SDK版本分布统计（POST）",
        "description": "返回数据库中所有应用的目标SDK版本（targetSdkVersion）分布情况。\n统计数据以SDK版本号为键，应用数量为值。\n用于了解开发者针对的Android目标版本趋势。",
        "operationId": "get_target_sdk_distribution",
        "requestBody": {
          "description": "搜索表达式，支持 AND/OR 嵌套逻辑, 参考 ApiSearchExpression",
          "content": {
            "application/json": {
              "schema": {
                "oneOf": [
                  {
                    "type": "null"
                  },
                  {
                    "$ref": "#/components/schemas/ApiSearchExpression"
                  }
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "成功返回各目标SDK版本的应用数量分布",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ApiResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/v0/feishu/meta.json": {
      "get": {
        "tags": [
          "飞书集成"
        ],
        "operationId": "feishu_meta",
        "responses": {
          "200": {
            "description": "获取飞书数据连接器元信息",
            "content": {
              "application/json": {
                "schema": {

                }
              }
            }
          }
        }
      }
    },
    "/api/v0/feishu/records": {
      "post": {
        "tags": [
          "飞书集成"
        ],
        "operationId": "feishu_records",
        "responses": {
          "200": {
            "description": "获取飞书记录",
            "content": {
              "application/json": {
                "schema": {

                }
              }
            }
          }
        }
      }
    },
    "/api/v0/feishu/table_meta": {
      "post": {
        "tags": [
          "飞书集成"
        ],
        "operationId": "feishu_table_meta",
        "responses": {
          "200": {
            "description": "获取飞书表格元信息",
            "content": {
              "application/json": {
                "schema": {

                }
              }
            }
          }
        }
      }
    },
    "/api/v0/market_info": {
      "get": {
        "tags": [
          "市场信息"
        ],
        "summary": "获取华为应用市场统计信息",
        "description": "该接口返回数据库中收录的应用市场统计数据，包括：\n- app_count: 应用数量统计\n- substance_count: 专题数量\n- developer_count: 开发者数量\n- page_size_max: 分页查询的最大页面大小\n- sync_status: 当前同步状态\n- crate_version: 服务版本号\n- user_agent: 请求华为API使用的User-Agent",
        "operationId": "market_info",
        "responses": {
          "200": {
            "description": "返回数据包括：应用总数、原子化服务数、开发者数、分页大小限制、同步状态、版本号等"
          }
        }
      }
    },
    "/api/v0/rankings/developers": {
      "get": {
        "tags": [
          "排行榜"
        ],
        "summary": "获取开发者排行榜",
        "description": "返回发布应用数量最多的开发者列表，按照应用数量降序排序。\n可通过limit参数控制返回数量，默认返回前10个开发者。\n返回数据包括开发者名称和其发布的应用数量。",
        "operationId": "get_developer_ranking",
        "parameters": [
          {
            "name": "limit",
            "in": "query",
            "description": "最大返回数量",
            "required": false,
            "schema": {
              "type": [
                "integer",
                "null"
              ],
              "format": "int32",
              "minimum": 0
            }
          },
          {
            "name": "exclude_pattern",
            "in": "query",
            "description": "排除的包名模式",
            "required": false,
            "schema": {
              "type": [
                "string",
                "null"
              ]
            }
          },
          {
            "name": "time_range",
            "in": "query",
            "description": "时间范围，例如 \"7d\", \"30d\"",
            "required": false,
            "schema": {
              "type": [
                "string",
                "null"
              ]
            }
          }
        ],
        "responses": {
          "200": {
            "description": "成功返回开发者排行榜，按应用数量降序排序",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ApiResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/v0/rankings/download_increase": {
      "get": {
        "tags": [
          "排行榜"
        ],
        "operationId": "download_increase",
        "parameters": [
          {
            "name": "months",
            "in": "query",
            "description": "月数间隔",
            "required": false,
            "schema": {
              "type": [
                "integer",
                "null"
              ],
              "format": "int32",
              "minimum": 0
            }
          },
          {
            "name": "days",
            "in": "query",
            "description": "天数间隔",
            "required": false,
            "schema": {
              "type": [
                "integer",
                "null"
              ],
              "format": "int32",
              "minimum": 0
            }
          },
          {
            "name": "limit",
            "in": "query",
            "description": "返回限制",
            "required": false,
            "schema": {
              "type": [
                "integer",
                "null"
              ],
              "format": "int32",
              "minimum": 0
            }
          },
          {
            "name": "listed_days",
            "in": "query",
            "description": "已上架天数",
            "required": false,
            "schema": {
              "type": [
                "integer",
                "null"
              ],
              "format": "int32",
              "minimum": 0
            }
          },
          {
            "name": "listed_months",
            "in": "query",
            "description": "已上架月数",
            "required": false,
            "schema": {
              "type": [
                "integer",
                "null"
              ],
              "format": "int32",
              "minimum": 0
            }
          },
          {
            "name": "page",
            "in": "query",
            "description": "分页页码",
            "required": false,
            "schema": {
              "type": [
                "integer",
                "null"
              ],
              "format": "int32",
              "minimum": 0
            }
          },
          {
            "name": "exclude_huawei",
            "in": "query",
            "description": "是否排除华为来源",
            "required": false,
            "schema": {
              "type": [
                "boolean",
                "null"
              ]
            }
          },
          {
            "name": "exclude_atomic",
            "in": "query",
            "description": "是否排除原子化应用",
            "required": false,
            "schema": {
              "type": [
                "boolean",
                "null"
              ]
            }
          }
        ],
        "responses": {
          "200": {
            "description": "获取应用下载量增长排行榜（指定时间区间）",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ApiResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/v0/rankings/max_download": {
      "get": {
        "tags": [
          "排行榜"
        ],
        "summary": "获取每日下载量最高的 APP",
        "description": "返回来自物化视图 `mv_daily_top_app_metrics` 的每日下载量最高的应用列表。\n不接受分页或 limit 参数，返回全部记录，response 的 total 与 limit 都等于返回列表长度。",
        "operationId": "get_max_download_per_day",
        "responses": {
          "200": {
            "description": "成功返回每日下载量最高的应用列表",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ApiResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/v0/rankings/rate_history": {
      "get": {
        "tags": [
          "排行榜"
        ],
        "summary": "获取应用评分历史数据",
        "description": "返回指定应用的每日评分统计历史数据，包括每日新增评分数、平均分等信息。\n必须提供 app_id 或 pkg_name 其中之一作为查询参数。",
        "operationId": "rate_history",
        "parameters": [
          {
            "name": "app_id",
            "in": "query",
            "description": "应用 ID",
            "required": false,
            "schema": {
              "type": [
                "string",
                "null"
              ]
            }
          },
          {
            "name": "pkg_name",
            "in": "query",
            "description": "包名",
            "required": false,
            "schema": {
              "type": [
                "string",
                "null"
              ]
            }
          }
        ],
        "responses": {
          "200": {
            "description": "成功返回应用评分历史数据，若缺少参数则返回错误信息",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ApiResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/v0/rankings/ratings": {
      "get": {
        "tags": [
          "排行榜"
        ],
        "summary": "获取评分排行榜",
        "description": "返回评分最高的应用列表，按照评分（rating）降序排序。\n可通过limit参数控制返回数量，默认返回前10个应用。",
        "operationId": "get_rating_ranking",
        "parameters": [
          {
            "name": "limit",
            "in": "query",
            "description": "最大返回数量",
            "required": false,
            "schema": {
              "type": [
                "integer",
                "null"
              ],
              "format": "int32",
              "minimum": 0
            }
          },
          {
            "name": "exclude_pattern",
            "in": "query",
            "description": "排除的包名模式",
            "required": false,
            "schema": {
              "type": [
                "string",
                "null"
              ]
            }
          },
          {
            "name": "time_range",
            "in": "query",
            "description": "时间范围，例如 \"7d\", \"30d\"",
            "required": false,
            "schema": {
              "type": [
                "string",
                "null"
              ]
            }
          }
        ],
        "responses": {
          "200": {
            "description": "成功返回评分最高的应用列表",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ApiResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/v0/rankings/recent": {
      "get": {
        "tags": [
          "排行榜"
        ],
        "summary": "获取最近更新应用排行榜",
        "description": "返回最近更新的应用列表，按照更新时间（updated_at）降序排序。\n可通过limit参数控制返回数量，默认返回前10个应用。",
        "operationId": "get_recent_ranking",
        "parameters": [
          {
            "name": "limit",
            "in": "query",
            "description": "最大返回数量",
            "required": false,
            "schema": {
              "type": [
                "integer",
                "null"
              ],
              "format": "int32",
              "minimum": 0
            }
          },
          {
            "name": "exclude_pattern",
            "in": "query",
            "description": "排除的包名模式",
            "required": false,
            "schema": {
              "type": [
                "string",
                "null"
              ]
            }
          },
          {
            "name": "time_range",
            "in": "query",
            "description": "时间范围，例如 \"7d\", \"30d\"",
            "required": false,
            "schema": {
              "type": [
                "string",
                "null"
              ]
            }
          }
        ],
        "responses": {
          "200": {
            "description": "成功返回最近更新的应用列表",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ApiResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/v0/statistics/current": {
      "get": {
        "tags": [
          "访问统计"
        ],
        "summary": "获取当前统计数据（内存中的实时数据）",
        "description": "GET /api/statistics/current",
        "operationId": "get_current_statistics",
        "responses": {
          "200": {
            "description": "获取当前统计数据（内存中的实时数据），包括UA和IP访问统计"
          }
        }
      }
    },
    "/api/v0/statistics/history": {
      "get": {
        "tags": [
          "访问统计"
        ],
        "summary": "获取历史统计数据（数据库中的持久化数据）",
        "description": "GET /api/statistics/history?stat_type=ua&page=1&page_size=50",
        "operationId": "get_history_statistics",
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "description": "页码",
            "required": false,
            "schema": {
              "type": "integer",
              "format": "int32",
              "minimum": 0
            }
          },
          {
            "name": "page_size",
            "in": "query",
            "description": "每页大小",
            "required": false,
            "schema": {
              "type": "integer",
              "format": "int32",
              "minimum": 0
            }
          },
          {
            "name": "stat_type",
            "in": "query",
            "description": "统计类型：\"ua\" 或 \"ip\"",
            "required": false,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "获取历史统计数据（数据库中的持久化数据），支持UA和IP统计查询"
          }
        }
      }
    },
    "/api/v0/statistics/hourly": {
      "get": {
        "tags": [
          "访问统计"
        ],
        "summary": "获取每小时统计趋势",
        "description": "GET /api/statistics/hourly?stat_type=ua&target=Mozilla/5.0...&start_time=...&end_time=...",
        "operationId": "get_hourly_statistics",
        "parameters": [
          {
            "name": "stat_type",
            "in": "query",
            "description": "统计类型：\"ua\" 或 \"ip\"",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "target",
            "in": "query",
            "description": "目标：user_agent 或 ip_address",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "start_time",
            "in": "query",
            "description": "开始时间（RFC3339格式）",
            "required": false,
            "schema": {
              "type": [
                "string",
                "null"
              ]
            }
          },
          {
            "name": "end_time",
            "in": "query",
            "description": "结束时间（RFC3339格式）",
            "required": false,
            "schema": {
              "type": [
                "string",
                "null"
              ]
            }
          }
        ],
        "responses": {
          "200": {
            "description": "获取每小时统计趋势，按时间段查询指定UA或IP的访问趋势"
          }
        }
      }
    },
    "/api/v0/statistics/summary": {
      "get": {
        "tags": [
          "访问统计"
        ],
        "operationId": "get_statistics_summary",
        "responses": {
          "200": {
            "description": "获取统计概览，包括总请求数、活跃UA和IP等汇总信息"
          }
        }
      }
    },
    "/api/v0/submit": {
      "post": {
        "tags": [
          "应用提交"
        ],
        "operationId": "submit_app",
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {

              }
            }
          },
          "required": true
        },
        "responses": {
          "200": {
            "description": "提交应用信息，需要提供app_id或pkg_name",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ApiResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/v0/submit_substance/{substance_id}": {
      "post": {
        "tags": [
          "应用提交"
        ],
        "summary": "提交专题信息",
        "description": "从华为应用市场获取指定专题的信息，并自动获取其关联的所有应用数据。\n如果数据库中不存在该专题，会将其保存到数据库。\n同时会同步所有关联的应用信息。",
        "operationId": "submit_substance",
        "parameters": [
          {
            "name": "substance_id",
            "in": "path",
            "description": "专题ID，例如：05998b06c4aa47469b2f26586bec699c",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "description": "请求体可选，支持comment字段添加备注信息",
          "content": {
            "application/json": {
              "schema": {

              },
              "example": {
                "comment": "用户提交的备注信息"
              }
            }
          },
          "required": true
        },
        "responses": {
          "200": {
            "description": "返回专题数据、是否为新记录、关联应用数量"
          }
        }
      }
    },
    "/api/v0/substance/list/{page}": {
      "get": {
        "tags": [
          "专题查询"
        ],
        "summary": "分页获取专题列表",
        "operationId": "substance_list_paged",
        "parameters": [
          {
            "name": "page",
            "in": "path",
            "description": "页码（从0开始）",
            "required": true,
            "schema": {
              "type": "integer",
              "format": "int32",
              "minimum": 0
            }
          },
          {
            "name": "sort",
            "in": "query",
            "description": "排序字段",
            "required": false,
            "schema": {
              "type": [
                "string",
                "null"
              ]
            }
          },
          {
            "name": "desc",
            "in": "query",
            "description": "是否降序",
            "required": false,
            "schema": {
              "type": [
                "boolean",
                "null"
              ]
            }
          },
          {
            "name": "page_size",
            "in": "query",
            "description": "每页大小",
            "required": false,
            "schema": {
              "type": [
                "integer",
                "null"
              ],
              "format": "int32",
              "minimum": 0
            }
          }
        ],
        "responses": {
          "200": {
            "description": "返回专题列表",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ApiResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/v0/substance/{substance_id}": {
      "get": {
        "tags": [
          "专题查询"
        ],
        "summary": "根据 substance_id 查询专题信息",
        "operationId": "query_substance",
        "parameters": [
          {
            "name": "substance_id",
            "in": "path",
            "description": "专题ID",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "返回专题信息",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ApiResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/v0/sync_status/stream": {
      "get": {
        "tags": [
          "市场信息"
        ],
        "operationId": "sync_status_stream",
        "responses": {
          "200": {
            "description": "SSE流：实时推送同步状态信息"
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "AccessLogQueryParams": {
        "type": "object",
        "description": "访问日志查询参数",
        "properties": {
          "ip": {
            "type": [
              "string",
              "null"
            ],
            "description": "IP 地址过滤"
          },
          "page": {
            "type": "integer",
            "format": "int32",
            "description": "页码",
            "minimum": 0
          },
          "page_size": {
            "type": "integer",
            "format": "int32",
            "description": "每页大小",
            "minimum": 0
          },
          "path": {
            "type": [
              "string",
              "null"
            ],
            "description": "路径过滤"
          },
          "ua": {
            "type": [
              "string",
              "null"
            ],
            "description": "User Agent 过滤"
          }
        }
      },
      "ApiResponse": {
        "type": "object",
        "description": "用于API响应的统一格式",
        "required": [
          "success",
          "data",
          "timestamp"
        ],
        "properties": {
          "data": {
            "description": "返回的数据，通常为任意 JSON 值"
          },
          "limit": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32",
            "description": "可选的分页限制（用于分页）",
            "minimum": 0
          },
          "success": {
            "type": "boolean",
            "description": "请求是否成功"
          },
          "timestamp": {
            "type": "string",
            "format": "date-time",
            "description": "响应生成时间戳（UTC）"
          },
          "total": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32",
            "description": "可选的总条目数（用于分页）",
            "minimum": 0
          }
        }
      },
      "ApiSearchExpression": {
        "oneOf": [
          {
            "type": "string",
            "description": "And 组合 (实际内容应为 Vec \u003CExperssion\u003E )\n这里为了防止 stack overflow, 不使用递归",
            "enum": [
              "And"
            ]
          },
          {
            "type": "string",
            "description": "Or 组合 (实际内容应为 Vec \u003CExperssion\u003E )\n同上",
            "enum": [
              "Or"
            ]
          },
          {
            "type": "object",
            "description": "具体条件",
            "required": [
              "Condition"
            ],
            "properties": {
              "Condition": {
                "$ref": "#/components/schemas/SearchCondition",
                "description": "具体条件"
              }
            }
          }
        ],
        "description": "搜索表达式（支持嵌套的 AND/OR 逻辑）\n(仅用于 openapi 生成文档, 无实际作用)\n\n# 示例 JSON\n\n单个条件:\n```json\n{ \"key\": \"name\", \"value\": \"test\", \"op\": \"like\" }\n```\n\nAND 组合:\n```json\n{ \"and\": [\n    { \"key\": \"name\", \"value\": \"test\", \"op\": \"like\" },\n    { \"key\": \"developer_name\", \"value\": \"华为\", \"op\": \"eq\" }\n]}\n```\n\nOR 组合:\n```json\n{ \"or\": [\n    { \"key\": \"name\", \"value\": \"test\", \"op\": \"like\" },\n    { \"key\": \"name\", \"value\": \"游戏\", \"op\": \"like\" }\n]}\n```\n\n嵌套组合 (A AND B) OR C:\n```json\n{ \"or\": [\n    { \"and\": [\n        { \"key\": \"name\", \"value\": \"test\", \"op\": \"like\" },\n        { \"key\": \"developer_name\", \"value\": \"华为\", \"op\": \"eq\" }\n    ]},\n    { \"key\": \"pkg_name\", \"value\": \"com.example\", \"op\": \"like\" }\n]}\n```"
      },
      "AppCounts": {
        "type": "object",
        "description": "应用数量统计信息结构体",
        "required": [
          "total",
          "apps",
          "atomic_services",
          "max_download_count"
        ],
        "properties": {
          "apps": {
            "type": "integer",
            "format": "int64",
            "description": "普通应用数量"
          },
          "atomic_services": {
            "type": "integer",
            "format": "int64",
            "description": "原子服务数量"
          },
          "max_download_count": {
            "type": "integer",
            "format": "int64",
            "description": "最大下载量"
          },
          "total": {
            "type": "integer",
            "format": "int64",
            "description": "应用总数"
          }
        }
      },
      "AppDailyRatingStats": {
        "type": "object",
        "description": "好评如潮\n\n应用评分信息 my_app_daily_rating_stats",
        "required": [
          "id",
          "report_date",
          "app_id",
          "pkg_name",
          "daily_new_1",
          "daily_new_2",
          "daily_new_3",
          "daily_new_4",
          "daily_new_5",
          "daily_new_count",
          "daily_new_average",
          "cumulative_total_count",
          "cumulative_avg_rating_high_prec"
        ],
        "properties": {
          "app_id": {
            "type": "string",
            "description": "应用 ID"
          },
          "cumulative_avg_rating_high_prec": {
            "type": "string",
            "description": "累计平均分 (基于星级总数重新计算，高精度)"
          },
          "cumulative_avg_rating_origin": {
            "type": [
              "string",
              "null"
            ],
            "description": "累计平均分 (原始数据库字段，低精度，可能为空)"
          },
          "cumulative_total_count": {
            "type": "integer",
            "format": "int32",
            "description": "累计总评分数 (当日快照)"
          },
          "daily_new_1": {
            "type": "integer",
            "format": "int32",
            "description": "1星 - 今日新增数量"
          },
          "daily_new_2": {
            "type": "integer",
            "format": "int32",
            "description": "2星 - 今日新增数量"
          },
          "daily_new_3": {
            "type": "integer",
            "format": "int32",
            "description": "3星 - 今日新增数量"
          },
          "daily_new_4": {
            "type": "integer",
            "format": "int32",
            "description": "4星 - 今日新增数量"
          },
          "daily_new_5": {
            "type": "integer",
            "format": "int32",
            "description": "5星 - 今日新增数量"
          },
          "daily_new_average": {
            "type": "string",
            "description": "今日平均评分 (基于各星级增量加权计算，高精度)"
          },
          "daily_new_count": {
            "type": "integer",
            "format": "int32",
            "description": "今日新增总评分数 (基于 Total 字段的实际变化量)"
          },
          "id": {
            "type": "integer",
            "format": "int64",
            "description": "视图生成的主键 ID"
          },
          "pkg_name": {
            "type": "string",
            "description": "应用包名"
          },
          "report_date": {
            "type": "string",
            "format": "date",
            "description": "统计日期"
          }
        }
      },
      "AppIconInfo": {
        "type": "object",
        "description": "应用图标信息结构体",
        "required": [
          "app_id",
          "pkg_name",
          "name",
          "icon_url"
        ],
        "properties": {
          "app_id": {
            "type": "string",
            "description": "应用的唯一标识符"
          },
          "icon_url": {
            "type": "string",
            "description": "图标URL地址"
          },
          "name": {
            "type": "string",
            "description": "应用名称"
          },
          "pkg_name": {
            "type": "string",
            "description": "应用包名"
          }
        }
      },
      "AppListQuery": {
        "type": "object",
        "description": "用于查询应用列表的查询参数",
        "properties": {
          "desc": {
            "type": [
              "boolean",
              "null"
            ],
            "description": "是否降序"
          },
          "detail": {
            "type": [
              "boolean",
              "null"
            ],
            "description": "返回详细信息（true）或简略信息（false）"
          },
          "exclude_atomic": {
            "type": [
              "boolean",
              "null"
            ],
            "description": "是否排除原子化应用"
          },
          "exclude_huawei": {
            "type": [
              "boolean",
              "null"
            ],
            "description": "是否排除华为来源应用"
          },
          "page_size": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32",
            "description": "每页大小",
            "minimum": 0
          },
          "search_exact": {
            "type": [
              "boolean",
              "null"
            ],
            "description": "是否精确匹配"
          },
          "search_key": {
            "type": [
              "string",
              "null"
            ],
            "description": "搜索字段名称"
          },
          "search_not_null": {
            "type": [
              "boolean",
              "null"
            ],
            "description": "搜索时是否排除空值"
          },
          "search_value": {
            "type": [
              "string",
              "null"
            ],
            "description": "搜索字段的值"
          },
          "sort": {
            "type": [
              "string",
              "null"
            ],
            "description": "排序字段"
          }
        }
      },
      "AppQueryListQuery": {
        "type": "object",
        "description": "用于简单查询应用列表的查询参数（不含搜索/排除条件）",
        "properties": {
          "desc": {
            "type": [
              "boolean",
              "null"
            ],
            "description": "是否降序"
          },
          "detail": {
            "type": [
              "boolean",
              "null"
            ],
            "description": "返回详细信息（true）或简略信息（false）"
          },
          "page": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32",
            "description": "页码（从0开始）",
            "minimum": 0
          },
          "page_size": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32",
            "description": "每页大小",
            "minimum": 0
          },
          "sort": {
            "type": [
              "string",
              "null"
            ],
            "description": "排序字段"
          }
        }
      },
      "AppQueryParam": {
        "type": "object",
        "properties": {
          "app_id": {
            "type": [
              "string",
              "null"
            ],
            "description": "应用 ID"
          },
          "pkg_name": {
            "type": [
              "string",
              "null"
            ],
            "description": "包名"
          }
        }
      },
      "CurrentStatisticsResponse": {
        "type": "object",
        "description": "当前统计响应",
        "required": [
          "ua",
          "ip",
          "total_ua_count",
          "total_ip_count"
        ],
        "properties": {
          "ip": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/IpStatEntry"
            },
            "description": "IP 统计列表"
          },
          "total_ip_count": {
            "type": "integer",
            "description": "IP 总数",
            "minimum": 0
          },
          "total_ua_count": {
            "type": "integer",
            "description": "UA 总数",
            "minimum": 0
          },
          "ua": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/UaStatEntry"
            },
            "description": "UA 统计列表"
          }
        }
      },
      "DownloadIncrement": {
        "type": "object",
        "description": "表示应用下载量增长的统计信息结构体",
        "required": [
          "app_id",
          "name",
          "pkg_name",
          "current_period_date",
          "prior_period_date",
          "current_download_count",
          "prior_download_count",
          "download_increment"
        ],
        "properties": {
          "app_id": {
            "type": "string",
            "description": "应用的唯一标识符"
          },
          "current_download_count": {
            "type": "integer",
            "format": "int64",
            "description": "当前周期的下载量"
          },
          "current_period_date": {
            "type": "string",
            "format": "date",
            "description": "当前统计周期日期"
          },
          "download_increment": {
            "type": "integer",
            "format": "int64",
            "description": "下载量增量"
          },
          "name": {
            "type": "string",
            "description": "应用名称"
          },
          "pkg_name": {
            "type": "string",
            "description": "应用包名"
          },
          "prior_download_count": {
            "type": "integer",
            "format": "int64",
            "description": "前一个周期的下载量"
          },
          "prior_period_date": {
            "type": "string",
            "format": "date",
            "description": "前一个统计周期日期"
          }
        }
      },
      "FullAppInfo": {
        "type": "object",
        "description": "2. app_full_info 表",
        "required": [
          "app_id",
          "alliance_app_id",
          "name",
          "pkg_name",
          "dev_id",
          "developer_name",
          "dev_en_name",
          "supplier",
          "kind_id",
          "kind_name",
          "kind_type_id",
          "kind_type_name",
          "icon_url",
          "brief_desc",
          "description",
          "privacy_url",
          "ctype",
          "detail_id",
          "app_level",
          "jocat_id",
          "iap",
          "hms",
          "tariff_type",
          "packing_type",
          "order_app",
          "denpend_gms",
          "denpend_hms",
          "force_update",
          "img_tag",
          "is_pay",
          "is_disciplined",
          "is_shelves",
          "submit_type",
          "delete_archive",
          "charging",
          "button_grey",
          "app_gift",
          "free_days",
          "pay_install_type",
          "created_at",
          "listed_at",
          "release_countries",
          "main_device_codes",
          "version",
          "version_code",
          "size_bytes",
          "sha256",
          "info_score",
          "info_rate_count",
          "download_count",
          "price",
          "release_date",
          "new_features",
          "upgrade_msg",
          "target_sdk",
          "minsdk",
          "compile_sdk_version",
          "min_hmos_api_level",
          "api_release_type",
          "metrics_created_at",
          "updated_at"
        ],
        "properties": {
          "alliance_app_id": {
            "type": "string"
          },
          "api_release_type": {
            "type": "string"
          },
          "app_gift": {
            "type": "boolean"
          },
          "app_id": {
            "type": "string"
          },
          "app_level": {
            "type": "integer",
            "format": "int32"
          },
          "app_recordal_info": {
            "type": [
              "string",
              "null"
            ]
          },
          "average_rating": {
            "type": [
              "string",
              "null"
            ]
          },
          "brief_desc": {
            "type": "string"
          },
          "button_grey": {
            "type": "boolean"
          },
          "charging": {
            "type": "boolean"
          },
          "comment": {

          },
          "compile_sdk_version": {
            "type": "integer",
            "format": "int32"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "ctype": {
            "type": "integer",
            "format": "int32"
          },
          "delete_archive": {
            "type": "boolean"
          },
          "denpend_gms": {
            "type": "boolean"
          },
          "denpend_hms": {
            "type": "boolean"
          },
          "description": {
            "type": "string"
          },
          "detail_id": {
            "type": "string"
          },
          "dev_en_name": {
            "type": "string"
          },
          "dev_id": {
            "type": "string"
          },
          "developer_name": {
            "type": "string"
          },
          "download_count": {
            "type": "integer",
            "format": "int64"
          },
          "force_update": {
            "type": "boolean"
          },
          "free_days": {
            "type": "integer",
            "format": "int32"
          },
          "full_average_rating": {
            "type": [
              "string",
              "null"
            ]
          },
          "hms": {
            "type": "boolean"
          },
          "iap": {
            "type": "boolean"
          },
          "icon_url": {
            "type": "string"
          },
          "img_tag": {
            "type": "string"
          },
          "info_rate_count": {
            "type": "integer",
            "format": "int64"
          },
          "info_score": {
            "type": "string"
          },
          "is_disciplined": {
            "type": "boolean"
          },
          "is_pay": {
            "type": "boolean"
          },
          "is_shelves": {
            "type": "boolean"
          },
          "jocat_id": {
            "type": "integer",
            "format": "int32"
          },
          "kind_id": {
            "type": "integer",
            "format": "int32"
          },
          "kind_name": {
            "type": "string"
          },
          "kind_type_id": {
            "type": "integer",
            "format": "int32"
          },
          "kind_type_name": {
            "type": "string"
          },
          "listed_at": {
            "type": "string",
            "format": "date-time"
          },
          "main_device_codes": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "metrics_created_at": {
            "type": "string",
            "format": "date-time"
          },
          "min_hmos_api_level": {
            "type": "integer",
            "format": "int32"
          },
          "minsdk": {
            "type": "integer",
            "format": "int32"
          },
          "my_star_rating": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32"
          },
          "name": {
            "type": "string"
          },
          "new_features": {
            "type": "string"
          },
          "only_star_count": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32"
          },
          "order_app": {
            "type": "boolean"
          },
          "packing_type": {
            "type": "integer",
            "format": "int32"
          },
          "pay_install_type": {
            "type": "integer",
            "format": "int32"
          },
          "pkg_name": {
            "type": "string"
          },
          "price": {
            "type": "string"
          },
          "privacy_url": {
            "type": "string"
          },
          "rating_created_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "recordal_entity_name": {
            "type": [
              "string",
              "null"
            ]
          },
          "recordal_entity_title": {
            "type": [
              "string",
              "null"
            ]
          },
          "release_countries": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "release_date": {
            "type": "integer",
            "format": "int64"
          },
          "sha256": {
            "type": "string"
          },
          "size_bytes": {
            "type": "integer",
            "format": "int64"
          },
          "source_type": {
            "type": [
              "string",
              "null"
            ]
          },
          "star_1_rating_count": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32"
          },
          "star_2_rating_count": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32"
          },
          "star_3_rating_count": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32"
          },
          "star_4_rating_count": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32"
          },
          "star_5_rating_count": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32"
          },
          "submit_type": {
            "type": "integer",
            "format": "int32"
          },
          "supplier": {
            "type": "string"
          },
          "tag_name": {
            "type": [
              "string",
              "null"
            ]
          },
          "target_sdk": {
            "type": "integer",
            "format": "int32"
          },
          "tariff_type": {
            "type": "string"
          },
          "title": {
            "type": [
              "string",
              "null"
            ]
          },
          "total_star_rating_count": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32"
          },
          "updated_at": {
            "type": "string",
            "format": "date-time"
          },
          "upgrade_msg": {
            "type": "string"
          },
          "version": {
            "type": "string"
          },
          "version_code": {
            "type": "integer",
            "format": "int64"
          }
        }
      },
      "FullSubstanceInfo": {
        "type": "object",
        "description": "专题完整信息",
        "required": [
          "substance_id",
          "title",
          "created_at",
          "apps"
        ],
        "properties": {
          "apps": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/ShortAppInfo"
            },
            "description": "专题包含的应用列表"
          },
          "comment": {
            "description": "专题备注信息"
          },
          "created_at": {
            "type": "string",
            "format": "date-time",
            "description": "专题创建时间"
          },
          "name": {
            "type": [
              "string",
              "null"
            ],
            "description": "专题名称"
          },
          "substance_id": {
            "type": "string",
            "description": "专题唯一标识符"
          },
          "subtitle": {
            "type": [
              "string",
              "null"
            ],
            "description": "专题副标题"
          },
          "title": {
            "type": "string",
            "description": "专题标题"
          }
        }
      },
      "HistoryQueryParams": {
        "type": "object",
        "description": "历史统计查询参数",
        "properties": {
          "page": {
            "type": "integer",
            "format": "int32",
            "description": "页码",
            "minimum": 0
          },
          "page_size": {
            "type": "integer",
            "format": "int32",
            "description": "每页大小",
            "minimum": 0
          },
          "stat_type": {
            "type": "string",
            "description": "统计类型：\"ua\" 或 \"ip\""
          }
        }
      },
      "HourlyQueryParams": {
        "type": "object",
        "description": "每小时统计查询参数",
        "required": [
          "stat_type",
          "target"
        ],
        "properties": {
          "end_time": {
            "type": [
              "string",
              "null"
            ],
            "description": "结束时间（RFC3339格式）"
          },
          "start_time": {
            "type": [
              "string",
              "null"
            ],
            "description": "开始时间（RFC3339格式）"
          },
          "stat_type": {
            "type": "string",
            "description": "统计类型：\"ua\" 或 \"ip\""
          },
          "target": {
            "type": "string",
            "description": "目标：user_agent 或 ip_address"
          }
        }
      },
      "IntervalParams": {
        "type": "object",
        "properties": {
          "days": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32",
            "description": "天数间隔",
            "minimum": 0
          },
          "exclude_atomic": {
            "type": [
              "boolean",
              "null"
            ],
            "description": "是否排除原子化应用"
          },
          "exclude_huawei": {
            "type": [
              "boolean",
              "null"
            ],
            "description": "是否排除华为来源"
          },
          "limit": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32",
            "description": "返回限制",
            "minimum": 0
          },
          "listed_days": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32",
            "description": "已上架天数",
            "minimum": 0
          },
          "listed_months": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32",
            "description": "已上架月数",
            "minimum": 0
          },
          "months": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32",
            "description": "月数间隔",
            "minimum": 0
          },
          "page": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32",
            "description": "分页页码",
            "minimum": 0
          }
        }
      },
      "IpStatEntry": {
        "type": "object",
        "description": "IP 统计条目",
        "required": [
          "ip_address",
          "count"
        ],
        "properties": {
          "count": {
            "type": "integer",
            "format": "int64",
            "description": "访问次数",
            "minimum": 0
          },
          "ip_address": {
            "type": "string",
            "description": "IP 地址"
          }
        }
      },
      "RankingQuery": {
        "type": "object",
        "description": "用于排行API的查询参数",
        "properties": {
          "exclude_pattern": {
            "type": [
              "string",
              "null"
            ],
            "description": "排除的包名模式"
          },
          "limit": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32",
            "description": "最大返回数量",
            "minimum": 0
          },
          "time_range": {
            "type": [
              "string",
              "null"
            ],
            "description": "时间范围，例如 \"7d\", \"30d\""
          }
        }
      },
      "SearchCondition": {
        "type": "object",
        "description": "单个搜索条件",
        "required": [
          "key"
        ],
        "properties": {
          "key": {
            "type": "string",
            "description": "搜索字段名称"
          },
          "op": {
            "$ref": "#/components/schemas/SearchOp",
            "description": "搜索操作符，默认为 like"
          },
          "value": {
            "type": [
              "string",
              "null"
            ],
            "description": "搜索值（对于 is_null/is_not_null 可以为空）"
          }
        }
      },
      "SearchOp": {
        "type": "string",
        "description": "搜索操作符",
        "enum": [
          "eq",
          "ne",
          "like",
          "not_like",
          "i_like",
          "not_i_like",
          "gt",
          "lt",
          "gte",
          "lte",
          "is_null",
          "is_not_null"
        ]
      },
      "ShortAppInfo": {
        "type": "object",
        "description": "简化过的 AppInfo",
        "required": [
          "app_id",
          "name",
          "pkg_name",
          "icon_url",
          "create_at"
        ],
        "properties": {
          "app_id": {
            "type": "string"
          },
          "create_at": {
            "type": "string",
            "format": "date-time"
          },
          "icon_url": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "pkg_name": {
            "type": "string"
          }
        }
      },
      "ShortAppRating": {
        "type": "object",
        "description": "简化版评分排行结构体",
        "required": [
          "app_id",
          "name",
          "pkg_name",
          "developer_name",
          "icon_url",
          "download_count"
        ],
        "properties": {
          "app_id": {
            "type": "string",
            "description": "应用唯一标识符"
          },
          "average_rating": {
            "type": [
              "string",
              "null"
            ],
            "description": "平均评分"
          },
          "developer_name": {
            "type": "string",
            "description": "开发者名称"
          },
          "download_count": {
            "type": "integer",
            "format": "int64",
            "description": "下载次数"
          },
          "icon_url": {
            "type": "string",
            "description": "应用图标URL地址"
          },
          "name": {
            "type": "string",
            "description": "应用名称"
          },
          "pkg_name": {
            "type": "string",
            "description": "应用包名"
          },
          "total_star_rating_count": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32",
            "description": "总评分人数"
          }
        }
      },
      "ShortSubstanceInfo": {
        "type": "object",
        "description": "专题简略信息",
        "required": [
          "substance_id",
          "title",
          "created_at"
        ],
        "properties": {
          "created_at": {
            "type": "string",
            "format": "date-time",
            "description": "专题创建时间"
          },
          "substance_id": {
            "type": "string",
            "description": "专题唯一标识符"
          },
          "subtitle": {
            "type": [
              "string",
              "null"
            ],
            "description": "专题副标题"
          },
          "title": {
            "type": "string",
            "description": "专题标题"
          }
        }
      },
      "StatisticsSummary": {
        "type": "object",
        "description": "统计概览\n\nGET /api/statistics/summary",
        "required": [
          "total_ua_types",
          "total_ips",
          "total_requests"
        ],
        "properties": {
          "most_active_ip": {
            "type": [
              "string",
              "null"
            ],
            "description": "最活跃的 IP"
          },
          "most_active_ua": {
            "type": [
              "string",
              "null"
            ],
            "description": "最活跃的 UA"
          },
          "total_ips": {
            "type": "integer",
            "description": "IP 总数",
            "minimum": 0
          },
          "total_requests": {
            "type": "integer",
            "format": "int64",
            "description": "总请求数",
            "minimum": 0
          },
          "total_ua_types": {
            "type": "integer",
            "description": "UA 类型总数",
            "minimum": 0
          }
        }
      },
      "SubstanceListQuery": {
        "type": "object",
        "properties": {
          "desc": {
            "type": [
              "boolean",
              "null"
            ],
            "description": "是否降序"
          },
          "page_size": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int32",
            "description": "每页大小",
            "minimum": 0
          },
          "sort": {
            "type": [
              "string",
              "null"
            ],
            "description": "排序字段"
          }
        }
      },
      "UaStatEntry": {
        "type": "object",
        "description": "UA 统计条目",
        "required": [
          "user_agent",
          "count"
        ],
        "properties": {
          "count": {
            "type": "integer",
            "format": "int64",
            "description": "访问次数",
            "minimum": 0
          },
          "user_agent": {
            "type": "string",
            "description": "User Agent 字符串"
          }
        }
      }
    }
  },
  "tags": [
    {
      "name": "应用查询",
      "description": "应用信息查询相关接口"
    },
    {
      "name": "市场信息",
      "description": "市场统计信息和同步状态"
    },
    {
      "name": "排行榜",
      "description": "各类应用排行榜"
    },
    {
      "name": "统计图表",
      "description": "数据分布统计图表"
    },
    {
      "name": "应用提交",
      "description": "应用信息提交接口"
    },
    {
      "name": "专题查询",
      "description": "专题信息查询相关接口"
    },
    {
      "name": "飞书集成",
      "description": "飞书数据连接器集成(目前未实现)"
    },
    {
      "name": "访问统计",
      "description": "API访问统计分析"
    }
  ]
}