# Spotify iOS：账号权限、播放顺序与音频插播

2026-11-10 至 11，在 iPhone 12 / iOS 18.6.2、Spotify 9.1.94（构建 919401928，`com.spotify.client`）、Quantumult X 1.8.1 上分析 Library 歌单只能随机播放的问题。用户授权临时观察、响应改写及限量 PCAP。本文记录接口证据、失败对照与会话恢复。缩小改写范围后一度取得两次自然顺序衔接及冷启动连续播放，但后续广告处理和精确回退又复现提前换曲，顺序改写未形成稳定资源；最终独立测试原生广告拒绝，在原始账号及随机模式下通过两次自然换曲和第三曲持续一分钟。

## 结论与可复用经验

最终采用 [spotify-ad-filter.conf](../../rewrites/spotify-ad-filter.conf) 1.0.0：仅对实测三个广告路径的 POST 请求返回 QX 原生拒绝，不改账号属性、设备许可、额度或音频素材。原始 Free 账号中，两首总长 6 分 26 秒、5 分 35 秒的歌曲完整播完，第三首持续至约 1 分 7 秒；两次转场额外缺口约 0.24 秒、0.15 秒，无插播画面、无下一首命令及歌曲行点击。它保留原有随机限制，不能作为顺序播放解锁资源。

主要权限入口是 `/user-customization-service/v1/customize` 返回的账号属性，设备能力接口另有独立许可。早期批量改写产品及许可属性的版本只短时成功，同一版本回退后不能复现。随后将处理缩小为五项播放模式及 `player-license`，保留 Free 类型、Free 目录、MFT 设备许可、财务产品和原始额度响应，取得两次按歌单顺序自然衔接，第三首持续超过一分钟，另一次冷启动点选首曲持续超过两分钟。后来音频广告容器过滤仍出现第二曲提前切换，精确回退六属性也复现跳歌，刷新原始账号正文后的随机播放同样异常。六属性组合说明客户端播放模式可以受此影响，尚不构成稳定方案。

用户明确反馈实验前随机模式可以完整播放。本轮后期即使恢复原始账号正文、全部 QX 配置和原始音质，仍复现几秒自动换曲。用户随后退出并重新登录同一账号，在相同原始配置下，同一首歌从约 1 秒持续至 2 分 5 秒，没有提前换曲；随后在不改写账号及设备正文的观察配置下，首曲自然播完，经过两段广告后继续播放，再有一次自然换曲，最后一曲持续超过一分钟。该对照说明配置恢复与登录会话刷新需要分开验证。后续全局广告开关实验取得与提前换曲窗口对应的播放接口 403，但没有进一步确认被拒绝文件的性质，仍不能把所有阶段的跳歌归为同一原因。

- 收藏列表排序、账号允许的播放模式、设备许可和实际播放队列属于不同层次。随机按钮为 `off` 不足以证明正常顺序播放。
- 账号属性可能返回 `304`。规则加载、规则命中、客户端收到新正文应分别验证；回滚需确认新的原始 `200`，避免继续使用改写后的缓存。
- 同一路径的脚本更新后，运行时仍可能使用旧版本。文件哈希不能代替实际请求中的版本证据。
- 点选歌曲与歌单顶部入口应分别观察。后者可能恢复已有上下文，不能仅凭点击顶部播放按钮宣称建立了新队列。
- 连续观察记录曲目、进度、总时长、广告状态和主动操作；自然换曲、提前换曲及广告间歇应分别判断。
- 已经成功过的版本也需要回退复测。其他版本失败后，同一旧版也失败，是不能把故障简单归因于新增字段的反证。

## 账号体系与实机接口

主要 API 主机为 `gae2-spclient.spotify.com`；身份资料请求也出现于 `spclient.wg.spotify.com`。区域主机仅代表本轮环境。

| 请求 | 实际证据 | 用途与边界 |
| --- | --- | --- |
| `POST /user-customization-service/v1/customize` | 原先 `304`；临时移除 `If-None-Match` 后取得 `200 application/protobuf`，原始样本 109417 字节、183 个账号属性 | 产品类型、播放模式和广告属性的直接来源；本轮主要改写入口 |
| `GET /device-capabilities/v1/capabilities` | 原始 `license=mft`、`effective_license=mft`，共 15 个字段 | 独立设备许可；同时改写两值及保留两值都做过对照 |
| `PUT /connect-state/v1/devices/{device}` | Protobuf；此前只提取到非活跃播放器状态中的 `options` | 队列和播放器状态候选，未取得目标歌单活跃队列的完整网络证据 |
| `POST /playback-settings/spotify.playbacksettings.PlaybackSettingsService/GetDeviceSettings` | `200 application/grpc` | 播放偏好候选；未解码具体值 |
| 同服务的 `GetSettingsDeviceSelection`、`GetAllStoredContentValues` | `200 application/grpc` | 仅确认接口命中 |
| `GET /storage-resolve/v2/files/audio/interactive/0/{file}` | 正常播放新曲时 `200 application/x-protobuf` | 音频地址解析；未修改素材和编码选择 |
| `POST /playplay/v1/key/{file}` | 正常六字段及失败广告开关窗口均有 `200` | 播放密钥请求；没有解密或改写密钥 |
| `GET /playplay/v1/playable/{file}` | 六字段正常窗口为 `200`；仅新增 `ads=false` 的提前换曲窗口取得两次 `403` | 已有服务端拒绝证据；文件标识已脱敏，尚不能区分对应广告或音乐文件 |
| `GET https://gae2-dealer.g2.spotify.com/` | `101`，`upgrade=websocket` | 发现持久连接握手；HTTP 观察没有取得 WebSocket 内的活动队列消息 |
| `POST /capping-api/spotify.cappingapi.v1.CappingApi/PutConsumption` | `200`、`grpc-status=0`；响应声明 `application/grpc`，本轮 bodyBytes 可直接解析为未分帧 Protobuf | 真实正文包含 `Spotify.Feature.PickAndShuffle` 等七种功能，不能把 HTTP 成功当作无限播放许可 |
| `POST /trials-facade/start-trial` | `200 application/json`，正文为 `{"result":"NOT_STARTED"}` | 已取得真实试用状态，不套用第三方声明但未实测的 Protobuf 包装 |
| `POST /ad-logic/prefetch` | `200` JSON；取得双音频广告的 `pod.stream` 及空 `pod` 对照 | 音频插播的定向处理入口；保留其他频道及外层调度 |
| `POST /ads/v3/ads` | `200`，实测空 `marquee` 或空 `preroll` 数组 | 最终原生拒绝的广告入口之一，也会影响该接口返回的其他广告频道 |
| `POST /ad-logic/v3/config` | `200`，544 字节 Protobuf | 未逐字段改写；最终按广告配置入口整体原生拒绝 |
| `POST /collection/v2/delta` | `200`，收藏增量 Protobuf | Library 数据，未修改 |
| `GET /playlist/v2/user/{user}/rootlist/diff`、`GET /playlist/v2/playlist/{playlist}` 及其 `/diff` | `200` 或 `304` | 根列表及歌单数据，未当作权限解除入口 |
| `GET /identity/v3/user/username/{user}` | `200 application/protobuf` 元数据 | 身份资料层，未改写 |

第三方订阅还声明了 `POST /bootstrap/v1/bootstrap`。本轮没有取得它的实机响应，曾仅对合成包装做离线验证；收窄后的候选不匹配该路径。启动阶段另见社交会话接口返回 `404`，没有证据将其归为跳歌根因。

## 原始账号属性

属性位于 `UcsResponseWrapper.success.accountAttributesSuccess.accountAttributes`；与实验配置 `resolveSuccess` 同处 UCS 响应，但属于不同子结构。

| 属性 | 原始值 |
| --- | --- |
| `type`、`catalogue` | `free` |
| `name` | `Spotify Free` |
| `player-license` | `mft` |
| `financial-product` | `pr:free,tc:0` |
| `mobile` | `false` |
| `on-demand` | `false` |
| `shuffle` | `true` |
| `smart-shuffle` | `FORCED` |
| `pick-and-shuffle` | `true` |
| `streaming-rules` | `shuffle-mode` |
| `shuffle-algorithm` | `FRESH` |
| `on-demand-trial`、`on-demand-trial-in-progress` | `expired`、`false` |
| `ads` | `true` |
| `streaming`、`capping-bar-threshold` | `true`、`3601` |
| `com.spotify.madprops.delivered.by.ucs`、`com.spotify.madprops.use.ucs.product.state` | `true` |

原始随机按钮开启，点击曾出现顺序播放需要 Premium 的提示。这支持账号播放模式受限，但不说明只改某个字段就能取得相应播放能力。`3601` 的单位、周期和含义未确认，不能据此推断日额度或跳歌根因。

[Spotify 随机播放帮助](https://support.spotify.com/us/article/shuffle-play/)说明移动端 Free 的 Smart Shuffle 行为；[Free 体验更新说明](https://newsroom.spotify.com/2025-09-15/free-experience-updates-features-tips/)介绍点选、搜索和分享播放。两者需要结合当前账号响应理解，点选单曲与关闭强制随机不是同一项能力。

## 新取得的额度响应

`PutConsumption` 的实测请求是 `application/x-protobuf`，响应声明 `application/grpc`，但本轮交给脚本的二进制正文没有标准五字节 gRPC 帧头，可直接解析 Protobuf。应以实际字节验证包装，不能仅凭 Content-Type 强套分帧。

响应包含七种功能，其中一个条目的标识为 `Spotify.Feature.PickAndShuffle`。该条目有 19 组窗口：一组保留默认起点、结束值可对应 9999 年末；其他窗口带有不同日期和数值。其余功能包括有声书、RunningMode 等。数值单位及未命名字段的完整语义仍未确认，不能直接解释为分钟额度。

据此准备的定向实验只保留 PickAndShuffle 条目原有的长期窗口，保留条目其他字段、其余六种功能和未知字节；同时只改五项播放模式，保持真实 Free、mft、广告、财务产品等属性。40 项离线检查通过，独立解码确认目标窗口从 19 组变为 1 组，其他功能未变。实机确认两层改写均命中，但开始播放后仍回到随机。再复制同一响应 RunningMode 条目中的状态字段 6 做单项对照，也未能关闭 Smart Shuffle；该字段的完整语义未确认，没有作为正式开关使用。两种额度改写均已撤回，后续候选保持额度响应逐字节原样。

## 响应改写与实机对照

实验使用 Protobuf 字节补丁，保留非目标属性、未知字段和外层包装；错误、未知结构及类型异常原样放行。八属性版本独立解码后，只有八个目标属性变化，其余 175 个属性保留。后续属性组合也确认 183 个键集及非目标字段未变。

五项播放模式为 `shuffle=false`、`on-demand=true`、`smart-shuffle=AVAILABLE`、`pick-and-shuffle=false`、`streaming-rules=""`。八属性版本另将 `type`、`catalogue`、`player-license` 改为 `premium`。这些只是客户端收到的值，不能证明服务端账号权益改变。

| 对照 | 实际改写 | 实机结果 |
| --- | --- | --- |
| 前期模式及属性组合 | 仅五项模式、八属性或加入指定 Smart Shuffle 布尔开关 | 部分界面可关闭随机，仍出现几秒自动换曲；关闭布尔开关也未稳定解决 |
| 账号及设备许可一致性，首次 | 八属性，加设备接口两个许可值；保留 `ads=true` | Liked Songs 短时连续播放通过；另一歌单首曲自然进入列表第二曲，第二曲持续超过一分钟；另一次点选首曲也持续超过一分钟 |
| 同一版本回退复测 | 与上一行相同的源代码和目标值 | 仍复现提前换曲，说明首次成功不能作为稳定交付依据 |
| 广告及产品属性组合 | 上述版本加入 `ads=false`；再分别加入 `financial-product=pr:premium,tc:0`、`mobile=true` | 实际新响应均确认命中；不同组合仍提前换曲，不能把问题单独归因于 `ads` |
| 保留真实设备许可 | UCS 十一项属性改写，设备接口原样保留 mft | 仍提前换曲，排除了“两个设备许可必须一并改写”作为充分条件 |
| 同时保留真实播放器许可 | 上一版本再保留 UCS 的 `player-license=mft`，共改十项属性 | 播放前可设 `off`，开始播放后返回 `on`；未通过顺序播放验证 |
| 五项模式及目标额度窗口 | 真实 Free/mft；PickAndShuffle 保留原有长期窗口，其他功能不变 | 实际响应确认命中，播放开始后仍由 `off` 返回 `on` |
| 额度窗口及同响应状态位 | 上一版本再复制 RunningMode 条目的字段 6，账号许可不变 | 无法将 Smart Shuffle 切至 `off`，未进入连续播放验证；已撤回 |
| 缩小播放器许可对照 | 五项模式加 `player-license=premium`；类型和目录仍 Free、设备仍 mft、广告仍 true，原始额度不变 | 曾通过短测、两次按列表自然衔接及冷启动两分钟；后续广告容器实验后精确回退也失败，不作为稳定资源交付 |


首次成功的被动观察约 6 分 25 秒：首曲总长 4 分 37 秒，从约 15 秒持续至 4 分 25 秒，之后自然进入列表第二曲并持续至约 1 分 3 秒，随机状态保持 `off`，没有发送下一首或点击歌曲行。两曲之间出现真实插播广告；转场间隔约 70 秒，首曲最后一次观测尚余 12 秒，多出的约 58 秒与广告画面相符。之后点选首曲的对照从约 9 秒持续到 1 分 12 秒。

失败对照中，未发送下一首命令时，首曲进度只有几秒，下一次采样已变为其他曲目；这与自然播完不同。早期失败方案没有成为正式资源；后续六属性候选另完成了多个自然衔接及冷启动对照。

指定 Smart Shuffle 配置为 `ios-system-smartshuffle.detect_and_resolve_smart_linear`，原始布尔值 `true`；其余 1116 项实验配置在相应单项对照中保持原始字节。还观察到 Free on-demand 和 common capping 相关配置，但未因名称就盲改枚举或宣称已确认配额根因。

合成检查覆盖账号和设备响应、非目标字段与协议包装保留、偏移视图、错误状态、未知结构、URL 边界、缓存头、回调次数及诊断副作用。仅账号候选的逻辑检查为 41 项，其中一个版本连同规则检查共 44 项；实机仍失败，离线通过不能代替播放验证。

六属性版本的主观察中，前两首分别自然播完，按列表进入第三首，随机始终为 `off`，没有下一首命令。首曲之后仍插入两段约 26 秒、24 秒广告，广告后继续到正确的第二首，说明广告仍是独立待处理目标。冷启动后再次取得新的账号 `200` 正文并独立核对六项变化，点选首曲从约 2 秒持续到 2 分 5 秒，未提前换曲。这些是当时取得的实机结果；后续回退失败使稳定性结论被推翻，不能只保留成功段落，也不能把之前的故障单独归因于某个产品标签。

## 插播广告响应与单项对照

六字段顺序版本已经取得真实插播正样本：首曲后出现约 26 秒、24 秒两段广告，画面为 `Your music will continue after the break`，广告后进入正确的下一首。不能用短时无广告宣称过滤成功。

随后只增加 `ads=false`，新账号正文确认只有七个字段变化，设备仍 MFT、额度响应逐字节原样。该版本在其他歌单短测约 30 秒后，主歌单首曲约 6 秒即提前进入第二曲；同窗口 `/playplay/v1/playable/{file}` 两次返回 403，并出现 `/storage-resolve/v2/files/audio/interactive/1/{file}`。`0` 与 `1` 的语义尚未确认，不能据此断言选择了某种付费格式。该七字段版本没有成为正式资源。

回退六字段时，曾同时尝试为改写后的正文生成弱 ETag 并去掉原校验头，离线检查通过，但第一次实机回退仍跳歌。之后精确撤掉该缓存头实验，保持六字段原始逻辑、移除采集包装，新的冷启动检查从约 7 秒持续至 2 分 11 秒，随机始终关闭。该结果曾说明精确回退可恢复短时连续播放，但随后同一逻辑再次失效，不能把恢复归因于 ETag，也不能仅凭 HTTP 缓存推演引入新处理。

已取得的音频广告响应结构：

```json
{
  "pod": {
    "stream": [
      {
        "id": "fixture-ad",
        "dummy": false,
        "metadata": {"format": "audio/ogg"},
        "audio": [{"mimetype": "audio/ogg", "media_file": "fixture-file", "duration_sec": 28}]
      }
    ]
  },
  "next_request": "100",
  "fallback_decision": {"max_length_seconds": 5, "max_ads": 0},
  "realtime_decision": {"max_length_seconds": 5, "max_ads": 0},
  "ad_decision_tree": {"stream": ["fixture-token"]}
}
```

同接口实测无投放响应含空 `pod`，仍保留 `next_request` 和两项 decision；不根据字段名猜测刷新单位或盲改调度。响应有时没有 Content-Type，因此依据严格 JSON 解析和已确认结构识别，兼容二进制 UTF-8 正文。

音频广告候选仅在 `pod.stream` 全部符合已确认音频广告结构时清空该数组，并清空对应 `ad_decision_tree.stream`；保留 `marquee`、`preroll`、其他决策、调度和未知字段。混合未知条目、视频、新格式、错误及不可解析响应原样放行，不请求素材或发送跟踪回执。真实双广告与空投放样本离线对照通过，合成检查覆盖非广告、未知及错误结构。

实机容器过滤取得移除 2～3 条音频广告的数值命中摘要，没有采集账号或广告正文。首曲完整结束后，准确进入列表第二曲，额外转场缺口约 0.06 秒、没有广告画面；但第二曲约 8 秒便提前进入第三曲，因此整体失败，已撤回。单次无广告衔接不能代替后续音乐完整性验证。

作为下一项有界对照，准备使用 QX 原生 `reject`，只匹配实测三个广告路径的 POST 请求。QX [官方配置说明](https://github.com/crossutility/Quantumult-X/blob/master/sample.conf)明确该动作返回无正文的 HTTP 404，不能称为应用内部取消任务。[公开项目的 9.1.x 修复记录](https://github.com/SideloadLabs/EeveeSpotifyReincarnated/pull/220)同时涉及内部广告服务、产品状态和请求取消，并指出仅阻断请求未必充分；它的注入式客户端及验证版本不同，不能直接当作 QX 成功依据。本轮不安装或修改该客户端。撤回容器过滤后，六属性版本及原始账号刷新均再次提前换曲，因此先停止新实验并恢复原始配置；用户再次登录、原始随机模式连续两分钟通过后，才单独安装原生广告拒绝，不再叠加六属性改写。

该独立原生对照实际加载一条广告规则，原始账号及随机模式保持不变。首曲完整播完后直接进入下一曲，第二曲也完整结束，第三曲持续超过一分钟；无广告画面，无相当于广告时长的缺口，也没有提前换曲。该结果仅覆盖本次 Spotify 9.1.94、原账号、两次自然转场；长期投放、其他客户端和播客内嵌广告未验证。

原生规则的配置加载和画面观察已分别记录。QX Activity 只提供连接统计，不能当作 HTTPS 路径命中。原生日志原级别为 Error；临时 Debug 冷启动核对没有取得包含上述广告 URI 的拒绝记录，不能将其他连接的 reject 计数写成 Spotify 命中。日志级别随后在原生菜单中核对恢复 Error。本资源基于此前真实广告响应及精确匹配编写，已完成方法、URL、MitM 与正常播放回归；本轮未单独导出实际原生 404 记录，长测无广告的结果仍受投放频控和缓存边界限制。

## 采集、回滚与播放恢复

早期限量日志以请求取消为主，没有定位根因。后续广告开关实验取得上述 `playable` 403，属于另一条 HTTP 元数据证据；不能用早期抓包的限制否认这一新增证据。前一个 PCAP 样本约 11 秒，早于首次播放采样；新样本从点选歌曲前开始，约 13 秒后达到容量限制，覆盖首个进度观测，但没有覆盖换曲后的下一次界面采样。虽然有音频 CDN 的加密数据及 TCP reset，仍不能据此推断 HTTP 状态、音频解密结果或服务端权益拒绝。

状态观察器首次记录了启动请求，但其文件更新后没有取得新的播放阶段版本证据；不能把这些启动记录当成跳歌窗口的完整 HTTP 状态记录。

回滚先将响应改为原样放行，保留定向缓存头处理，确认新账号响应为 `200`、改写前后正文完全一致；Free、mft、强制随机及 `ads=true` 均恢复，设备能力也恢复 mft。响应含原始 ETag 和 `private, max-age=0`；多次样本中的 `fetchTimeMillis` 随采集时间更新。缓存影响仍需实证，不能把 ETag 的存在直接认作根因。

随后逐字节恢复原始 QX 关联配置，通过原生 Update 和隧道重连确认恢复 16 条重写、19 个 MitM hostname，重写、MitM 与 VPN 开启。

前一轮曾在应用内 Clear cache 并重建上下文后，验证两个场景各持续超过一分钟；整曲观察因控制连接中断未完成。本次继续探索后，恢复验证有新的反证：

- 新原始账号正文及原生 Clear cache 后，Liked Songs 顶部播放仍从约 11 秒提前换曲。
- 撤掉全部临时规则、恢复原始配置后，点选另一歌单首曲，仍从约 1 秒提前换到其他曲目。
- 输出设备确认是 `This iPhone`。Wi-Fi 和蜂窝音质原先均为 Automatic；临时将 Wi-Fi 设为 Normal 仍跳歌，随后已核对恢复 Automatic。
- 临时关闭 QX 隧道后仍提前换曲；测试结束已恢复 VPN 开启。这一对照不足以把问题定位到 QX 链路。

原始配置、账号正文、音质及 VPN 恢复后，用户退出并重新登录同一账号。相同歌曲在随机模式下从约 1 秒持续至 2 分 5 秒，两分钟连续观察通过，未发送下一首命令。随后仅增加 Connect 状态观察、保持账号和设备正文原样：首曲总长 4 分 37 秒，自然结束后播放约 29 秒及 26 秒两段广告，再进入一首 1 分钟歌曲；该曲自然结束后继续另一首，最后一曲持续至约 1 分 12 秒。两次自然音乐衔接通过，未发送下一首命令。整曲观察使用了只读观察配置，完全原始配置下的两分钟对照单独保留。

新容器对照失败后，精确回退六属性版本再次从约 8 秒提前换曲；再只临时刷新原始账号响应、完全不改正文，随机播放也从约 9 秒提前进入另一曲。两次均未发送下一首命令。这表明撤回文件和刷新正文仍不能代替会话恢复，也不能凭首次长测就交付该组合。

随后逐字节恢复原始关联配置，通过 QX 原生 Update、开关核对和隧道重连确认恢复；本轮临时脚本及规则已撤下，正文、元数据与数值计数采集器均已停止。已删除不再使用的含采集密钥脚本和运行配置，原始材料只保留在项目外私有目录，未进入仓库。用户再次退出并登录同一账号后，完全原始配置下的随机播放从约 6 秒持续至 2 分 12 秒，没有提前换曲，未发送下一首命令；第二次会话刷新后的两分钟对照通过。等待用户处理期间没有继续操作手机。随后仅在原始账号和原随机模式上准备一条原生广告拒绝对照，不再叠加账号许可或额度改写。

本轮没有形成稳定的顺序播放改写方案，相关失败 JS 没有进入正式资源目录。最终仅交付独立通过原账号整曲对照的原生广告资源；它与五项 URL、方法和 MitM 边界检查一起纳入仓库，完整 `npm test` 为 37 项通过。发布及安装说明见 README。后续若继续研究顺序播放，应先建立原始模式对照，避免同时改变许可、额度和广告行为。
