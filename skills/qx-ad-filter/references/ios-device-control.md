# iOS 设备控制

仅在采集或验证需要设备操作时使用本参考。工具是否安装、设备是否配对、签名是否有效和操作是否获准，都由当前环境决定；历史案例不提供本轮授权。

## 选择控制通道

| 通道 | 需要验证的能力与条件 |
| --- | --- |
| CoreDevice 或设备 CLI | 发现设备、启动 App、截图、文件共享等能力分别核对；配对本身不提供任意点击能力 |
| 辅助功能接口 | 读取控件与执行点击可能有不同权限；读取成功后仍需验证动作是否生效 |
| iPhone 镜像或其他屏幕工具 | 确认当前会话确实能访问原生窗口并执行交互，不能只检查应用已安装 |
| WebDriverAgent / XCUITest | 需要兼容的开发工具、目标设备可运行且已信任的测试 Runner，以及可用控制连接 |

优先使用已有可用通道。若缺少必要能力，完成其他可做的准备后，再说明所需手动动作或新增部署范围。

## 按需使用 WebDriverAgent

先连接现成 Runner 并检查状态；状态接口可访问后，还需创建会话、读取当前界面并验证实际点击。服务就绪不代表具备全部交互能力。

确需构建或安装 Runner 时：

1. 发现当前设备，确认配对、Developer Mode 与测试自动化条件；核对本机 Xcode、WDA 和设备工具的兼容性。
2. 使用独立测试 App ID，核对签名团队、描述文件覆盖的设备与 App ID、权限及有效期，不重签或替换 QX。
3. 沿用当前任务已经明确的签名、注册和安装授权；团队或范围不明时，先完成可离线进行的检查与构建，再确认缺失事项。钥匙串及设备信任由用户通过系统界面处理。
4. 通过 XCTest 启动 Runner，检查实际服务状态与绑定地址。控制连接优先经 USB 或回环地址，避免向不相关网络暴露。
5. 创建目标 App 会话。设备标识、Runner bundle ID、构建路径与 session ID 都从本轮发现结果取得，不沿用示例值。

工具参数可能变化。使用前读取本机 `--help`，按当前版本确认启动、界面查询、点击及关闭会话的方法；不要把案例中的固定端口、环境变量或控件名称当成接口保证。

## 操作与验证

每次操作前取得新界面树或截图，从当前可见控件定位。点击后核对页面或开关的实际变化，不跨页面复用旧控件 ID 或盲用坐标。界面树的 `name`、`label`、`value` 都可能包含订阅凭据，保存前一并脱敏。

重新应用 QX 配置时，确认当前配置来源，使用对应的原生更新流程；需要重启隧道时，分别确认断开与恢复连接。若恢复失败，先恢复正常连接，停止重复切换。

配置更新、隧道重启、规则命中与广告消失分别验证，具体证据见[采集与配置生效](capture.md)和[验证与离线测试器](verification.md)。URL Scheme、资源添加接口或分流模式切换是否等价于目标操作，需查明语义后再使用。

密码锁屏可能需要用户解锁；配对或自动化连接不能用来绕过锁屏。

## 收尾

关闭控制会话，停止本轮启动的测试服务与转发，移除含敏感数据的临时界面树和日志。核对配置、重写与 MitM 开关以及 VPN 处于任务要求的最终状态。

若保留 Runner 供后续复用，只记录必要的工具与版本条件；下次重新检查签名有效期、设备信任与服务状态，不假定旧会话仍可使用。

## 工具依据

需要部署或核对具体接口时查对应资料，并与本机版本匹配：

- [Apple：iPhone 镜像](https://support.apple.com/en-us/120421)。
- [Appium：真实设备准备](https://appium.github.io/appium-xcuitest-driver/latest/getting-started/device-setup/)。
- [Appium：WDA 签名与描述文件](https://appium.github.io/appium-xcuitest-driver/latest/getting-started/provisioning-profile/)。
- [pymobiledevice3](https://github.com/doronz88/pymobiledevice3)。
- [QX URL Scheme](https://github.com/crossutility/Quantumult-X/blob/master/url-scheme.md)与[配置 API](https://github.com/crossutility/Quantumult-X/blob/master/sample-configuration-api.js)。
