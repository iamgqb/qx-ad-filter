# qx-ad-filter

可订阅的 Quantumult X rewrite resources、广告过滤脚本，以及用于分析 App、网站广告并编写 QX 规则的 Codex 技能。

正式脚本只保留过滤逻辑：不写统计、不记录日志、不发通知，也不增加网络请求。优先使用适合接口返回格式的 QX 原生规则，需要保留响应结构时才使用 JavaScript。

## 已收录的规则与脚本

| 目标 | 脚本 | 订阅资源 | 已验证范围 |
| --- | --- | --- | --- |
| 微博国际版 Weibo intl. | [weibo-ad-filter.js](scripts/weibo-ad-filter.js) | [weibo-ad-filter.conf](rewrites/weibo-ad-filter.conf) | 7.2.2 的开屏预加载、SDK 广告位、信息流广告与广告卡片 |
| 恩基爱社区 | QX 原生规则，无 JS | [nga-ad-filter.conf](rewrites/nga-ad-filter.conf) | 1.1.47 的 SDK 开屏与推荐流广告；热帖、版块及帖子回复回归 |

微博国际版的 bundle ID 为 `com.weibo.international`；这些规则的验证范围是国际版。详细接口分析、缓存处理和验证边界见[微博经验记录](docs/experience/weibo-case.md)。

## 微博国际版订阅使用

仓库：[iamgqb/qx-ad-filter](https://github.com/iamgqb/qx-ad-filter)，发布分支为 `main`。

在 QX 的重写资源中添加以下 URL：

```text
https://raw.githubusercontent.com/iamgqb/qx-ad-filter/main/rewrites/weibo-ad-filter.conf
```

也可以把订阅记录加入当前配置已有的 `[rewrite_remote]` 段：

```ini
[rewrite_remote]
https://raw.githubusercontent.com/iamgqb/qx-ad-filter/main/rewrites/weibo-ad-filter.conf, tag=微博国际版去广告, update-interval=86400, enabled=true
```

这是 QX 原生 rewrite resource：资源内包含 `hostname` 和 7 条 URL 规则，6 条引用远程 JS，实时开屏使用 `reject-dict`。资源中没有 `[rewrite_local]` 或 `[mitm]` 段名；QX 通过资源中的完整 HTTPS 地址获取脚本。

启用 VPN、重写和 MitM，并确保自己的 MitM 证书已安装且完全信任。已有证书、节点及其他配置继续沿用。此前安装过本地微博规则时，启用订阅后清理重复规则，避免匹配冲突。

脚本仅在内容发生修改时编码 JSON；未知结构及接口错误原样放行。接口和投放方式变化后可能需要更新规则。停用时在重写资源列表中禁用或移除该订阅。

## 恩基爱社区订阅使用

[nga-ad-filter.conf](rewrites/nga-ad-filter.conf) 包含 5 条原生 `reject-dict` 规则和 7 个 MitM hostname，不需要 JavaScript。规则依据恩基爱社区 1.1.47 的实机请求编写，覆盖广告聚合、广点通、快手、穿山甲和 Sigmob 的具体投放路径。普通帖子、图片、SDK 配置和官方活动轮播保留。分析与验证记录见[恩基爱社区案例](docs/experience/nga-ios-case.md)。

在 QX 的重写资源中添加以下 URL：

```text
https://raw.githubusercontent.com/iamgqb/qx-ad-filter/main/rewrites/nga-ad-filter.conf
```

也可以加入当前配置已有的 `[rewrite_remote]` 段：

```ini
[rewrite_remote]
https://raw.githubusercontent.com/iamgqb/qx-ad-filter/main/rewrites/nga-ad-filter.conf, tag=恩基爱社区去广告, update-interval=86400, enabled=true
```

资源已携带 5 条规则和必要 hostname，无需托管或下载 JS。启用 VPN、重写及 MitM，并沿用已安装且完全信任的 MitM 证书。此前使用本地版本时，启用订阅后移除重复的 5 条本地规则；重复 hostname 仅在没有其他规则依赖时移除。

这些广告 SDK 接口可能被其他 App 共用，相同接口的广告也会被拦截。停用时，在重写资源列表中禁用或移除「恩基爱社区去广告」订阅。保留原有证书、节点、其他订阅及分流。

## 发布与更新

将 `scripts/` 和 `rewrites/` 一起发布到仓库 `main` 分支后，上述订阅地址即可使用。资源中的 JS 地址为：

```text
https://raw.githubusercontent.com/iamgqb/qx-ad-filter/main/scripts/weibo-ad-filter.js
```

发布后检查各资源及其引用的 JS 的 Raw 地址返回实际文件内容，而不是 GitHub 的 HTML 页面。恩基爱社区资源只需发布 `rewrites/nga-ad-filter.conf`，不需要 JS。订阅配置设置为每 86400 秒更新；发布修改后也可在 QX 中手动刷新资源，并确认相应远程脚本已更新。若使用固定版本，资源和脚本应同时指向该版本。

用户已要求远程发布时，按[远程发布与订阅收尾](skills/qx-ad-filter/references/resource-format.md#远程发布与订阅收尾)完成提交、推送、Raw 正文验证和已授权的 QX 订阅安装，再交付可用地址。

## 通用广告分析技能

入口：[skills/qx-ad-filter/SKILL.md](skills/qx-ad-filter/SKILL.md)。

技能目录只包含通用流程、按需参考和离线测试器，可独立复制使用。它不绑定本仓库的微博实现、发布账号、设备环境或签名状态。按需参考：

- [订阅资源格式](skills/qx-ad-filter/references/resource-format.md)：资源文件结构、远程脚本 URL、订阅配置与发布检查。
- [采集与配置生效](skills/qx-ad-filter/references/capture.md)：网站与 App 采样、脱敏、配置来源和生效证据。
- [iOS 设备控制](skills/qx-ad-filter/references/ios-device-control.md)：控制通道选择、WDA 的必要条件、操作验证与收尾。
- [验证与离线测试器](skills/qx-ad-filter/references/verification.md)：正反样本、开屏对照、同步回调测试器及最终清理。

技能保存在仓库中，尚未安装到全局。可直接让 Codex 读取该 `SKILL.md`；若需要常规技能发现，可将整个 `skills/qx-ad-filter` 目录复制或链接到 `~/.codex/skills/qx-ad-filter`，再使用 `$qx-ad-filter`。

示例请求：

> 使用 $qx-ad-filter 分析这个 App 的开屏和信息流广告，基于实际响应编写 QX 规则；最终脚本不要包含统计或排查逻辑。

## 经验与案例

历史观察单独保存在 `docs/experience/`，按“可复用经验、具体证据、适用边界”整理。它们用于理解排查思路，不随技能加载；接口字段、工具参数和验证结果均需按当前目标重新确认。

| 记录 | 主要经验 |
| --- | --- |
| [微博国际版](docs/experience/weibo-case.md) | 独立广告接口、预加载缓存与频控对照，以及精简后的验证边界 |
| [X iOS 解密限制](docs/experience/x-ios-case.md) | 代理证书拒绝的证据，取得响应前的采集边界 |
| [iOS 屏幕控制](docs/experience/ios-device-control-case.md) | 区分读屏与点击能力，分层验证签名、配置更新和隧道重启 |
| [恩基爱社区](docs/experience/nga-ios-case.md) | 限量 SDK 元数据采集、精确原生拒绝、开屏与多页面对照 |

X 原生 iOS App 12.36 在记录的测试环境中拒绝 QX 代理证书，未取得可供过滤的时间线响应；本仓库没有可用的 X 过滤规则。该结论不覆盖其他版本或网页版。

## 本地验证

需要 Node.js 18 或更高版本，无需安装第三方 npm 依赖：

```sh
npm test
```

回归包含：独立广告数组清理、正常微博与分页保留、嵌套卡片、SDK `OK` 后缀、预加载记录失效、错误放行、URL 匹配边界，以及零诊断 I/O、未修改时不编码 JSON、原生订阅格式和远程脚本文件映射。NGA 原生规则另检查 SDK 投放路径、MitM 覆盖、唯一匹配和普通业务路径保留。

也可以用技能自带测试器验证其他同步响应脚本：

```sh
node skills/qx-ad-filter/scripts/run-rewrite.cjs \
  scripts/weibo-ad-filter.js tests/fixtures/weibo-basic.json
```

这些测试验证 JavaScript 行为，不替代手机上的规则命中与画面验证。微博 1.1.0 曾完成实机广告验证；当前 1.2.0 在保留过滤行为的基础上移除了诊断开销，完成离线对照和手机文件回读。仓库测试使用重新构造的脱敏数据。

## 添加其他 App 或网站

新增脚本、规则或分析前，遵守[项目维护约定](AGENTS.md)。该文件统一规定目录归属、通用技能与经验分离、脱敏、验证及交付要求。

仅需原生拒绝时直接增加 `rewrites/` 资源和 URL 回归；需要改写响应时再增加 `scripts/` 与脱敏响应样本。具体分析保存在 `docs/experience/`，可迁移的方法按需提炼到技能参考文档，并更新上方资源表和经验索引。

## 参考

- [Quantumult X 官方配置示例](https://github.com/crossutility/Quantumult-X/blob/master/sample.conf)：重写类型、脚本目录及 MitM 配置。
- [Quantumult X 官方响应脚本示例](https://github.com/crossutility/Quantumult-X/blob/master/sample-rewrite-with-script.js)：请求、响应与回调接口。
- [微博开屏兼容处理参考](https://github.com/ddgksf2013/Scripts/blob/master/weibo_json.js)：案例中预加载字段处理的参考来源，具体规则以本机响应和测试为准。
