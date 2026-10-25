# 订阅资源格式

## 原生 rewrite resource

QX 的订阅资源直接包含 `hostname` 和 URL 规则。文件扩展名可以是 `.conf` 或 `.snippet`，内容应符合原生格式；不要把完整配置里的 `[rewrite_local]` 和 `[mitm]` 段名放进资源。

以下仅为结构示例，使用时替换成当前目标域名和实际托管地址：

```text
# 示例 App 广告过滤；@author yuecheng
hostname = api.example.com
^https://api\.example\.com/ads(?:[?]|$) url script-response-body https://rules.example.com/scripts/example-ad-filter.js
```

JS 是独立的远程文件，不把 JavaScript 正文内嵌到资源中。脚本参数使用能直接返回脚本正文的完整 HTTPS URL，不使用本地文件名、相对路径或 HTML 预览页；使用 GitHub 时应选择 Raw 地址。资源本身不包含证书、节点或其他个人配置。

原生资源结构见 [QX 官方订阅示例](https://github.com/crossutility/Quantumult-X/blob/master/sample-import-rewrite.snippet)。不需要为这种原生格式额外安排格式转换脚本。

## 主配置中的订阅记录

下面这段属于用户主配置的已有 `[rewrite_remote]` 段，不属于资源正文：

```ini
[rewrite_remote]
https://rules.example.com/rewrites/example-ad-filter.conf, tag=示例 App 去广告, update-interval=86400, enabled=true
```

使用说明给出资源 URL、订阅方式、MitM 和证书前提，以及禁用或移除订阅的方法。示例更新间隔只是可选值，应按用户需求和发布方式设置。资源已携带 hostname 与脚本 URL，用户通过 QX 订阅即可获取。已有本地规则时检查重复匹配，不把主配置整体替换成资源文件。配置项以 [QX 官方主配置示例](https://github.com/crossutility/Quantumult-X/blob/master/sample.conf)为准。

## 发布一致性

- 根据用户给出的发布地址、Git remote 或确认的托管配置生成 URL，不从本机用户名推断远程账号。托管平台、分支与目录布局由当前任务决定。
- 确认托管方式能让 QX 无交互读取；不要在可分享的资源 URL 中内嵌凭据。
- 获准发布时让资源与 JS 保持一致；使用固定版本时，双方都指向同一版本。使用分支时确认该分支存在或明确是待发布分支。
- 本地检查远程脚本 URL 对应的发布文件确实存在，资源不依赖手机 Scripts 目录中的副本。
- 发布后检查资源及所有脚本 URL 的状态和正文，确认实际返回文本文件。尚未发布时只能确认格式和路径，明确标明订阅地址在发布后生效。
- 更新由 QX 获取资源及脚本完成。遇到旧行为时检查相应远程脚本的缓存和刷新状态，不以刷新资源列表就断定所有脚本已更新。
