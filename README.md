# AI环境管理工具

https://github.com/user-attachments/assets/87a2be3f-c9d3-46be-9526-ace0223d7330

一个简洁高效的 Python AI 开发环境管理工具，提供可视化界面进行 Python 依赖包的管理和维护。

## 特色功能

1. **全面的依赖概览**
   - 清晰展示所有已安装的 Python 依赖
   - 实时检查并显示最新版本状态
   - 智能分类标记系统、AI模型和数据科学相关依赖
   - 自动获取并显示依赖的详细描述信息

2. **高效的依赖管理**
   - 一键安装、卸载和更新依赖
   - 支持版本历史浏览和快速切换
   - 批量操作多个依赖
   - 支持上传安装 wheel 文件和 requirements.txt

3. **优化的用户体验**
   - 实时搜索和多条件筛选
   - 明暗主题切换
   - 响应式界面设计
   - 操作进度可视化

## 使用方法

1. 双击 `启动.bat` 文件运行应用
2. 在浏览器中访问 `http://127.0.0.1:8282` 打开管理界面
3. 应用将自动加载所有已安装的 Python 依赖

### 依赖搜索和筛选

- 使用顶部搜索框快速查找依赖
- 使用下拉菜单按类别筛选（全部、核心、软件、数据科学、人工智能、其他）

### 依赖安装

- 在底部安装区域输入包名称直接安装
- 支持指定版本号（例如：`tensorflow==2.15.0`）
- 上传 .whl 文件进行本地安装
- 上传 requirements.txt 批量安装

### 批量操作

- 使用复选框选择多个依赖
- 点击"批量卸载"一次性移除多个依赖
- 点击"一键更新所选依赖"将所选依赖更新到最新版本
- 点击"清理PIP缓存"快速释放存储空间

## 多环境管理
- 可设置指定目录环境进行管理，支持虚拟环境和便携式环境

## 系统要求

- Windows 操作系统
- Python 3.7+
- 现代浏览器（推荐 Chrome、Edge 或 Firefox 最新版本）

## 故障排除

如果遇到问题：

1. 确保您的Python环境正常工作
2. 检查是否有防火墙阻止了应用程序
3. 确保端口8282未被其他应用占用
4. 如有问题，请查看控制台输出的错误信息
5. 如果一直停留在加载界面，请检查自己的网络，确保魔法畅通。

## 更新日志

### V2.1.0-正式版 (2025-05-27) 

**问题修复** 🐛
- 修复前后端通信BUG，解决依赖更新后前端界面无法刷新的问题
- 优化网络并发请求机制，大幅提高批量操作时的稳定性和响应速度
- 完善错误处理机制，提升系统整体稳定性

### V2.0.0-Bata (2025-05-24)

**新特性** ✨
- 全新的用户界面设计，提供更直观的操作体验
- 多环境管理，支持便携式环境丶虚拟环境丶系统环境管理（支持添加多个环境）

**优化改进** 🔨
- 优化依赖安装流程，提升安装成功率
- 优化批量操作功能，提供更清晰的进度展示
- 提升整体性能和响应速度

**问题修复** 🐛
- 修复某些依赖无法正确显示版本信息的问题
- 修复在特定情况下安装wheel文件失败的问题
- 解决requirements.txt导入时的编码问题
- 修复批量更新时可能出现的并发问题
- 修复无法正确获取描述的问题

**待修复问题** （该问题将在下个版本修复）
- 前后端通信存在一定BUG，更新依赖后前端界面有时会出现无法刷新的情况，需要刷新浏览器才能查看最新结果。
- 网络并发请求还有近一步优化的空间

### V1.0.0 (2025-04-02)

- 最初版本上线，支持管理本地Python环境

## 支持作者

🎭 我用代码垒起一座围栏，把Bug都关在了里面...
但是！Bug总会顽皮地翻墙逃出来，我需要你的支持来买更多的砖头补墙！

以下是我的"防Bug补墙基金"募捐通道 👇

💡 捐赠小贴士：
- ¥6.66 - 助我喝杯咖啡，让Bug没机会钻空子
- ¥66.6 - 够我吃顿好的，代码写得更欢乐
- ¥666 - 我要给Bug们建豪华监狱！

🎯 声明：本项目开源免费，打赏纯自愿。
不打赏也没关系，但你的程序可能会遇到一些"不经意的小惊喜"... 

![收款码](https://github.com/user-attachments/assets/f7fde32c-83b9-4c4b-8e4b-e6192ee34cec)

(开玩笑的，绝对不会有Bug😉)

