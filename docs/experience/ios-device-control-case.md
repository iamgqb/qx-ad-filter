# iOS 屏幕控制：从读屏到实际操作

本案例记录 2026-10-25 在 iPhone 12 / iOS 18.6.2、QX 1.8.1、Xcode 26.5 与 pymobiledevice3 11.44.0 上的操作探索。采用 WebDriverAgent 16.15.3，通过独立签名并由设备信任的测试 Runner 完成 QX 配置更新与 VPN 断开、重连。

此处记录历史证据和排查经验，不代表其他环境已具备相同工具、设备信任或安装授权。通用操作流程见[iOS 设备控制](../../skills/qx-ad-filter/references/ios-device-control.md)。

## 可复用经验

- 设备发现、启动 App、读屏、读取控件和实际点击是不同能力，应分别验证。
- 签名身份存在不代表描述文件覆盖目标设备；Runner 安装成功也不代表已经信任或可以执行 XCTest。
- 用当前界面定位控件，并在动作后读取结果；不将固定控件名称和坐标跨版本复用。
- 配置更新、隧道重启与新规则命中分别确认，不能互相替代。
- 描述文件有效期和服务状态是运行时条件，不应作为技能中的长期部署状态。

## 控制通道的实际结果

| 通道 | 当时的观察 | 适用边界 |
| --- | --- | --- |
| 已配对 USB / CoreDevice | 能发现设备、启动 App、截图和访问 QX 文件共享 | 这些能力不自带任意坐标点击 |
| pymobiledevice3 辅助功能 | 能列出 QX 控件，但未完成点击；当时 `perform_press` 要求的 `task_for_pid-allow` 不在目标 App 元数据中 | 不能从控件可读推断动作可用 |
| iPhone 镜像 | 应用已安装，但当时电脑工具仅暴露浏览器，未能操作原生镜像窗口 | 属于当时工具入口的限制，不能泛化为镜像不支持点击 |
| WDA / XCUITest | 服务就绪后能创建 QX 会话、读屏和点击 | 依赖有效签名、设备信任、兼容工具与实际连接 |

## 签名与启动中遇到的问题

最初有可用签名身份，但现有描述文件未包含目标设备。完成当前任务授权范围内的独立 Runner 签名与安装后，首次启动仍显示 `Untrusted Developer`；经系统界面完成信任后，XCTest 才能启动，WDA 状态接口返回 HTTP 200、`ready=true`。

这段经过说明：构建、签名覆盖、安装、设备信任、服务就绪和点击成功各有独立条件。复用时重新检查这些条件，不能继承历史任务的团队选择、注册权限或服务状态。

## 配置与隧道的验证证据

1. 点击重写规则入口后，界面从代理列表切换到规则列表，确认实际点击生效。
2. 从当前关联配置菜单执行 Update，观察加载开始、结束且无可见错误；原有重写与 MitM 开关保持开启。
3. 重新查询主界面开关后关闭、开启，值依次为 `1 → 0 → 1`。
4. 独立的 `nesessionmanager` 日志显示隧道依次经历 `disconnecting → disconnected → connecting → connected`。
5. 配置内容与操作前备份逐字节一致。结束控制会话并停止测试服务与 USB 转发后，QX 仍保持连接。

本轮验证了界面操作、配置更新流程和隧道重启，没有新增广告规则，也没有验证新规则命中。配置文件名、个人 Runner 标识、签名账号、临时目录与到期日不作为复用资料保留。

## 历史工具版本中的命令形态

以下用于理解当时的工具组合。实际运行前核对当前 CLI 的 `--help`，变量由当前设备发现、构建和会话结果赋值；不直接执行未填入当前值的示例。

```sh
xcrun devicectl list devices
xcrun devicectl device install app --device "$QX_COREDEVICE_ID" "$QX_RUNNER_APP_PATH"

python -m pymobiledevice3 developer dvt xcuitest \
  "$QX_RUNNER_BUNDLE_ID" --userspace --udid "$QX_DEVICE_UDID"

python -m pymobiledevice3 developer wda launch \
  com.crossutility.quantumult-x --udid "$QX_DEVICE_UDID"

python -m pymobiledevice3 developer wda list-items \
  --session-id "$QX_WDA_SESSION_ID" --with-rect --udid "$QX_DEVICE_UDID"

python -m pymobiledevice3 developer wda tap "$QX_CONTROL_LABEL" \
  --session-id "$QX_WDA_SESSION_ID" --using 'accessibility id' \
  --udid "$QX_DEVICE_UDID"
```

当时通过回环地址上的 USB 转发访问 WDA HTTP 接口，包括创建会话、读取界面树与截图、查找元素及点击。设备端使用经当时源码确认的 `USE_IP` / `USE_PORT` 选项限制绑定范围；这些选项与绑定结果需按当前实现重新核对。

界面树中的 `name`、`label`、`value` 都可能包含订阅凭据，应先脱敏再保存。密码锁屏仍可能需要手动解锁。安装与控制过程的原始截图、签名资料和设备标识均不进入仓库。
