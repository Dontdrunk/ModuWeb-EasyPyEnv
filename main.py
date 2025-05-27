"""
AI环境管理工具 - 程序入口点

此文件是应用程序的主入口点，负责初始化和启动后端服务器。
应用功能通过导入的模块实现，保持主文件的简洁性。
"""

# 导入必要的模块
from py import api, dependency, core

# 启动应用服务器
if __name__ == '__main__':
    core.print_status("启动AI环境管理工具...", "info")
    core.print_status("服务将在 http://127.0.0.1:8282 上启动", "info")
    
    # 在应用启动前加载依赖描述缓存
    dependency.load_descriptions()
    
    # 启动Flask应用，绑定到127.0.0.1:8282
    api.app.run(host='127.0.0.1', port=8282, debug=False)
