# 微博国际版：独立广告接口与开屏缓存

本案例来自 2026-10-25 的 iPhone 12 / iOS 18.6.2、微博国际版 7.2.2（`com.weibo.international`）与 QX 1.8.1。以下数量、字段与间隔仅代表本次采样，不应直接套用到其他 App。

## 可复用经验

- 信息流广告可能来自独立接口；主列表没有广告字段时仍需继续关联请求。
- 开屏应同时排查配置、SDK、预加载与实时请求。缓存失效方式取决于客户端更新语义。
- 先复现广告，再比较过滤后的数据与画面；频控窗口内没有广告不构成充分证据。
- 文件同步、规则执行和画面变化分别确认；精简版本也要说明验证到哪一层。

以下保留接口证据与验证经过，供类似问题参考，不作为通用字段模板。

## 信息流：广告不一定在 timeline 内

`api.weibo.cn/2/statuses/friends/timeline` 返回 25 条正常微博，所采样的 `mblogtype` 为 0，`ad_marked` 为 false，内嵌广告数组为空。另一接口 `/2/ad/weibointl` 单独返回：

```json
{"data":[{"id":"fixture-1"},{"id":"fixture-2"},{"id":"fixture-3"},{"id":"fixture-4"}],"errno":0,"error":""}
```

清空这个专用广告接口的 `data`，保留成功外壳和错误响应后，用户确认刷新已无广告。仅对 timeline 做广告标记过滤会漏掉这类投放。

混合列表仍需兼容明确广告标记，但正常正文含“广告”、`mblogtype` 非零或标签为“推荐”，都不能单独作为删除依据。分页和正常条目应保持不变。

## 开屏：配置、SDK 和预加载是多条路径

国际版 `portal.php?a=get_coopen_ads` 的成功响应包含 `data` 对象：

- `gdt_video_ad_ios`：2 个 iOS SDK 广告位。
- `pic_ad`：1 个图片广告位。
- `ad_cd_interval`：1200 秒。
- `display_ad`、广告位 ID、`uve_ad_scene*`、备用渠道与 `scheme_white_list` 等。

最终实现清理确定的 iOS 广告位、ID 与广告场景，保留 `display_ad`、白名单和服务端间隔。不能仅按字段名称猜测，把 `display_ad` 改成 0 就认为所有渠道已关闭。

后来真正复现了淘宝/天猫全屏广告，并捕获 `bootpreload.uve.weibo.com/v1/ad/preload`：根对象包含 `code:200`、`last_ad_show_interval:1800` 和 14 条 `ads`。每条含广告 ID、展示次数、时长、投放时间以及 `creatives` 素材记录。

该路径采用保留 ID 的失效方式，以便返回记录覆盖旧预加载配置：展示次数和时长归零，广告与素材的投放时间移至未来。脚本使用的未来时间在 32 位有符号时间戳范围内；这属于本接口的已验证处理方式，不是通用缓存策略。

实时路径 `bootrealtime.uve.weibo.com/vN/ad/realtime` 使用精确的 QX `reject-dict`；其他已知 SDK 接口支持清空广告容器，并保留可能出现的 JSON 正文后缀 `OK`。

## 两个关键误判

第一次冷启动的 6 帧没有广告，用户随后仍遇到广告。原因是没有排除 20/30 分钟频控和缓存，不能据此宣布成功。后来在同一采样方式下复现阳性对照，36 帧中有 12 帧含开屏广告标识；新版两轮短间隔启动及一轮正式版启动均未观察到该标识，并核对了处理后的数据。

另一次问题是 QX 的部分请求执行新版脚本，部分仍走旧观察规则。重新打开 QX 主界面未能独自证明规则已应用；最终通过实际执行证据和用户重新应用配置、重启隧道完成确认。文件回读一致与运行规则已切换是两件事。

## 精简与验证边界

信息流接口与画面先完成验证；1.1.0 补齐开屏预加载后，实机记录显示 14 条记录全部失效，SDK 广告位 2 → 0、图片广告位 1 → 0，恢复了原始 1200/1800 秒间隔。

1.2.0 移除统计对象、额外计数遍历、日志和 iCloud 写入，信息流改为原地清理，仅在改写时编码 JSON。该版本完成离线行为对照和手机文件回读；这些证据不代表新一轮完整实机广告验证，文件大小变化也不代表 CPU 或耗电测量结果。

## 参考

- [QX 官方配置示例](https://github.com/crossutility/Quantumult-X/blob/master/sample.conf)。
- [QX 官方响应脚本示例](https://github.com/crossutility/Quantumult-X/blob/master/sample-rewrite-with-script.js)。
- [开屏字段处理参考](https://github.com/ddgksf2013/Scripts/blob/master/weibo_json.js)。
