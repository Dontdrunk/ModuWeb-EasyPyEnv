"""
API模块 - 处理Web API路由和请求响应

此模块提供:
- Flask应用和路由定义
- API端点实现
- 请求处理和响应格式化
- 文件上传管理
"""

import os
import sys
import json
import time
import tempfile
import shutil
import uuid
import threading
from flask import Flask, jsonify, request, send_from_directory, Response
from flask_cors import CORS
import logging

# 导入自定义模块
from . import config
from . import dependency
from . import utils

# 创建Flask应用实例
app = Flask(__name__, static_folder='..')
CORS(app)  # 启用跨域请求支持

# 自定义日志配置 - 减少冗余日志输出
class RequestFilter(logging.Filter):
    def filter(self, record):
        # 过滤掉检查描述更新的请求日志
        return 'GET /api/check-description-updates' not in record.getMessage()

# 应用日志过滤器
logging.getLogger('werkzeug').addFilter(RequestFilter())
# 设置日志级别为WARNING，减少不必要的INFO日志
logging.getLogger('werkzeug').setLevel(logging.WARNING)

# 通用API响应格式化
def api_response(success, message=None, data=None, status_code=200):
    """
    格式化API响应
    
    Args:
        success (bool): 操作是否成功
        message (str, optional): 响应消息
        data (dict, optional): 响应数据
        status_code (int): HTTP状态码
    
    Returns:
        tuple: (Flask JSON响应, 状态码)
    """
    response = {"success": success}
    if message:
        response["message"] = message
    if data:
        response.update(data)
    return jsonify(response), status_code

# 根路由 - 提供静态文件
@app.route('/')
def index():
    """提供主页HTML"""
    return send_from_directory('..', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """提供静态文件"""
    return send_from_directory('..', path)

# 获取依赖列表
@app.route('/api/dependencies')
def get_dependencies():
    """获取所有已安装的依赖信息"""
    try:
        # 检查是否使用缓存
        use_cache = request.args.get('useCache', 'false').lower() == 'true'
        
        # 获取依赖列表
        dependencies = dependency.get_all_dependencies(use_cache)
        
        return jsonify(dependencies)
    except Exception as e:
        utils.print_status(f"获取依赖列表时出错: {e}", 'error')
        return api_response(False, f"获取依赖列表失败: {str(e)}", status_code=500)

# 检查依赖描述更新
@app.route('/api/check-description-updates')
def check_description_updates():
    """检查是否有新的依赖描述信息"""
    # 获取前端上次更新的时间戳
    last_update = float(request.args.get('lastUpdate', 0))
    # 检查是否为环境变更请求
    environment_changed = request.args.get('environmentChanged', 'false').lower() == 'true'
    current_time = time.time()
    
    # 检查是否为首次UI加载后的请求（时间戳接近于0表示首次请求）
    if last_update < 1:
        # UI首次加载完成，触发只更新缺失描述的操作
        threading.Thread(
            target=dependency.async_update_descriptions,
            kwargs={'only_missing': True},
            daemon=True
        ).start()
        utils.print_status("UI加载完成，开始后台更新缺失的依赖描述", 'info')
    # 环境变更请求，只更新缺失的依赖描述
    elif environment_changed:
        # 环境已变更，触发更新所有依赖描述
        threading.Thread(
            target=dependency.async_update_descriptions,
            kwargs={'only_missing': True},  # 改为只更新缺失的依赖描述
            daemon=True
        ).start()
        utils.print_status("Python环境已切换，开始更新所有的依赖描述", 'info')
        # 强制标记有更新
        if hasattr(dependency, 'last_description_update'):
            dependency.last_description_update = current_time
    
    # 检查是否有更新
    has_updates = False
    if current_time - last_update < 10 and hasattr(dependency, 'last_description_update'):
        if dependency.last_description_update > last_update:
            has_updates = True
    
    return jsonify({'hasUpdates': has_updates})

# 批量卸载依赖
@app.route('/api/batch-uninstall', methods=['POST'])
def batch_uninstall():
    """批量卸载多个依赖"""
    data = request.json
    packages = data.get('packages', [])
    
    if not packages:
        return api_response(False, '没有选择要卸载的依赖', status_code=400)
    
    # 创建任务
    task_id = utils.create_task('卸载', packages)
    
    # 启动后台任务执行批量卸载
    threading.Thread(
        target=dependency.batch_uninstall,
        args=(packages, task_id),
        daemon=True
    ).start()
    
    return api_response(True, f'正在卸载 {len(packages)} 个依赖', {'taskId': task_id})

# 安装依赖
@app.route('/api/install', methods=['POST'])
def install_dependency_route():
    """安装依赖"""
    data = request.json
    package_name = data.get('packageName', '')
    
    if not package_name:
        return api_response(False, '包名称不能为空', status_code=400)
    
    # 执行安装
    success, message = dependency.install_dependency(package_name)
    
    if success:
        return api_response(True, message)
    else:
        return api_response(False, message, status_code=400)

# 卸载依赖
@app.route('/api/uninstall', methods=['POST'])
def uninstall_dependency_route():
    """卸载依赖"""
    data = request.json
    package_name = data.get('dependency', '')
    
    if not package_name:
        return api_response(False, '依赖名称不能为空', status_code=400)
    
    # 执行卸载
    success, message = dependency.uninstall_dependency(package_name)
    
    if success:
        return api_response(True, message)
    else:
        return api_response(False, message, status_code=400)

# 更新依赖
@app.route('/api/update', methods=['POST'])
def update_dependency_route():
    """更新依赖到最新版本"""
    data = request.json
    package_name = data.get('dependency', '')
    
    if not package_name:
        return api_response(False, '依赖名称不能为空', status_code=400)
    
    # 创建任务
    task_id = utils.create_task('更新', [package_name])
    
    # 启动后台任务执行更新
    threading.Thread(
        target=lambda: dependency.update_dependency(package_name, task_id),
        daemon=True
    ).start()
    
    return api_response(True, f'正在更新: {package_name}', {'taskId': task_id})

# 切换依赖版本
@app.route('/api/switch-version', methods=['POST'])
def switch_version_route():
    """切换依赖版本"""
    data = request.json
    package_name = data.get('dependency', '')
    version = data.get('version', '')
    
    if not package_name or not version:
        return api_response(False, '依赖名称和版本不能为空', status_code=400)
    
    # 创建任务
    task_id = utils.create_task('切换版本', [f"{package_name}=={version}"])
    
    # 启动后台任务执行版本切换
    threading.Thread(
        target=lambda: dependency.switch_version(package_name, version, task_id),
        daemon=True
    ).start()
    
    return api_response(True, f'正在将 {package_name} 切换到版本 {version}', {'taskId': task_id})

# 更新所选依赖
@app.route('/api/update-selected', methods=['POST'])
def update_selected_route():
    """更新所选依赖"""
    data = request.json
    packages = data.get('packages', [])
    
    if not packages:
        return api_response(False, '没有选择要更新的依赖', status_code=400)
    
    # 创建任务
    task_id = utils.create_task('更新', packages)
    
    # 启动后台任务执行批量更新
    threading.Thread(
        target=dependency.batch_update,
        args=(packages, task_id),
        daemon=True
    ).start()
    
    return api_response(True, f'正在更新 {len(packages)} 个依赖', {'taskId': task_id})

# 安装wheel文件
@app.route('/api/install-whl', methods=['POST'])
def install_whl_route():
    """安装wheel文件"""
    if 'file' not in request.files:
        return api_response(False, '没有上传文件', status_code=400)
    
    file = request.files['file']
    if file.filename == '':
        return api_response(False, '没有选择文件', status_code=400)
    
    if not file.filename.endswith('.whl'):
        return api_response(False, '只支持.whl文件', status_code=400)
    
    try:
        # 创建临时文件
        temp_dir = tempfile.mkdtemp()
        temp_file_path = os.path.join(temp_dir, file.filename)
        
        # 保存上传的文件
        file.save(temp_file_path)
        
        # 创建任务ID用于跟踪进度
        task_id = utils.create_task('安装WHL', [file.filename])
        
        # 使用线程启动安装过程，实现异步操作
        def process_whl_install():
            try:
                result = dependency.install_whl(temp_file_path, task_id)
                if not result:
                    utils.complete_task(task_id, [f"安装失败: {file.filename}"])
            finally:
                # 确保临时目录被清理
                if os.path.exists(temp_dir):
                    shutil.rmtree(temp_dir, ignore_errors=True)
        
        # 启动后台任务
        threading.Thread(target=process_whl_install, daemon=True).start()
        
        return api_response(True, f'正在安装 {file.filename}，请等待...', {'taskId': task_id})
    except Exception as e:
        # 确保清理临时文件
        if 'temp_dir' in locals():
            shutil.rmtree(temp_dir, ignore_errors=True)
        utils.print_status(f"处理wheel安装请求时出错: {str(e)}", 'error')
        return api_response(False, f'安装失败: {str(e)}', status_code=400)

# 安装requirements.txt文件
@app.route('/api/install-requirements', methods=['POST'])
def install_requirements_route():
    """安装requirements.txt文件"""
    if 'file' not in request.files:
        return api_response(False, '没有上传文件', status_code=400)
    
    file = request.files['file']
    if file.filename == '':
        return api_response(False, '没有选择文件', status_code=400)
    
    if not file.filename.endswith('.txt'):
        return api_response(False, '只支持.txt文件', status_code=400)
    
    try:
        # 创建临时文件
        temp_dir = tempfile.mkdtemp()
        temp_file_path = os.path.join(temp_dir, 'requirements.txt')
        
        # 保存上传的文件
        file.save(temp_file_path)
        
        # 创建任务ID
        task_id = utils.create_task('安装', ['从requirements.txt安装'])
        
        # 后台处理函数
        def process_requirements_install():
            try:
                result = dependency.install_requirements(temp_file_path, task_id)
                if not result:
                    utils.complete_task(task_id, [f"安装失败: {file.filename}"])
            finally:
                # 确保临时目录被清理
                if os.path.exists(temp_dir):
                    shutil.rmtree(temp_dir, ignore_errors=True)
        
        # 启动后台任务
        threading.Thread(target=process_requirements_install, daemon=True).start()
        
        return api_response(True, '正在安装packages，请等待...', {'taskId': task_id})
    except Exception as e:
        # 确保清理临时文件
        if 'temp_dir' in locals():
            shutil.rmtree(temp_dir, ignore_errors=True)
        return api_response(False, f'安装失败: {str(e)}', status_code=500)

# 获取任务进度
@app.route('/api/task-progress/<task_id>')
def get_task_progress(task_id):
    """获取任务进度"""
    if task_id not in utils.task_progress:
        return api_response(False, '任务不存在', status_code=404)
    
    return jsonify(utils.task_progress[task_id])

# 清理PIP缓存
@app.route('/api/clean-pip-cache', methods=['POST'])
def clean_pip_cache_route():
    """清理pip缓存"""
    # 创建任务
    task_id = utils.create_task('清理缓存', ['pip cache'])
    
    # 启动后台任务执行缓存清理
    threading.Thread(
        target=lambda: dependency.clean_pip_cache(task_id),
        daemon=True
    ).start()
    
    return api_response(True, '正在清理PIP缓存', {'taskId': task_id})

# 检查所有依赖的最新版本
@app.route('/api/check-versions', methods=['POST'])
def check_all_versions():
    """检查所有依赖的最新版本 - 返回SSE流以报告进度"""
    def generate():
        try:
            # 获取已安装的依赖列表
            all_deps = dependency.get_all_dependencies(use_cache=True)
            
            # 筛选需要检查的包 - 排除系统依赖和软件依赖
            packages_to_check = [
                dep for dep in all_deps 
                if not dep['isSystem'] and not dep['isAppRequired']
            ]
            
            # 计算检查的总数量
            total = len(packages_to_check)
            utils.print_status(f"需要检查 {total} 个依赖的版本信息", 'info')
            
            # 发送初始进度
            yield json.dumps({"progress": 0}) + "\n"
            
            # 启动异步更新
            threading.Thread(
                target=dependency.async_update_descriptions_and_versions,
                daemon=True
            ).start()
            
            # 模拟进度报告 - 由于实际进度无法精确测量，我们使用模拟的进度报告
            progress_steps = [10, 25, 40, 60, 75, 90, 100]
            for progress in progress_steps:
                time.sleep(0.5)  # 添加短暂延迟以模拟处理时间
                yield json.dumps({"progress": progress}) + "\n"
                if progress == 100:
                    break
            
        except Exception as e:
            utils.print_status(f"检查版本过程出错: {e}", 'error')
            yield json.dumps({"error": str(e)}) + "\n"
    
    return Response(generate(), mimetype='text/event-stream')

# 获取系统信息
@app.route('/api/system-info')
def get_system_info():
    """获取Python和pip版本信息"""
    try:
        import subprocess
        
        # 获取Python版本
        python_version = sys.version.split()[0]
        
        # 获取pip版本
        pip_version_process = subprocess.run(
            [sys.executable, '-m', 'pip', '--version'], 
            capture_output=True, 
            text=True
        )
        pip_version = pip_version_process.stdout.split()[1] if pip_version_process.returncode == 0 else "未知"
        
        return jsonify({
            'pythonVersion': python_version,
            'pipVersion': pip_version
        })
    except Exception as e:
        utils.print_status(f"获取系统信息失败: {e}", 'error')
        return jsonify({
            'pythonVersion': '未知',
            'pipVersion': '未知'
        }), 500

# 用户设置API
@app.route('/api/settings', methods=['GET'])
def get_settings():
    """获取用户设置"""
    try:
        settings = config.load_user_settings()
        return jsonify(settings)
    except Exception as e:
        utils.print_status(f"获取用户设置失败: {e}", 'error')
        return api_response(False, f"获取设置失败: {str(e)}", status_code=500)

@app.route('/api/settings', methods=['POST'])
def update_settings():
    """更新用户设置"""
    try:
        data = request.json
        
        # 加载当前设置
        current_settings = config.load_user_settings()
        
        # 更新设置
        current_settings.update(data)
        
        # 保存设置
        if config.save_user_settings(current_settings):
            return api_response(True, "设置已更新")
        else:
            return api_response(False, "保存设置失败", status_code=500)
    except Exception as e:
        utils.print_status(f"更新设置时出错: {e}", 'error')
        return api_response(False, f"更新设置时出错: {str(e)}", status_code=500)

# 获取缓存信息
@app.route('/api/cache-info')
def get_cache_info():
    """获取缓存信息，包括最后更新时间"""
    try:
        cache_info = config.get_cache_info()
        return jsonify(cache_info)
    except Exception as e:
        utils.print_status(f"获取缓存信息失败: {e}", 'error')
        return api_response(False, f"获取缓存信息失败: {str(e)}", status_code=500)

# 获取依赖分类
@app.route('/api/dependency-categories')
def get_dependency_categories():
    """获取依赖分类信息"""
    try:
        return jsonify(config.dependency_config)
    except Exception as e:
        utils.print_status(f"获取依赖分类信息失败: {e}", 'error')
        return api_response(False, f"获取依赖分类信息失败: {str(e)}", status_code=500)

# 获取依赖关系图数据
@app.route('/api/dependency-graph/<package_name>')
def get_dependency_graph(package_name):
    """获取指定包的依赖关系图数据"""
    try:
        # 获取查询参数
        max_depth = request.args.get('depth', default=2, type=int)  # 默认深度为2层
        include_dev = request.args.get('dev', default='false', type=str).lower() == 'true'
        
        # 限制最大深度以避免过大的响应
        if max_depth > 4:
            max_depth = 4
        
        # 调用依赖模块获取依赖关系图数据
        graph_data = dependency.get_dependency_graph(package_name, max_depth, include_dev)
        
        # 返回图数据
        return api_response(True, data=graph_data)
        
    except Exception as e:
        app.logger.error(f"获取依赖关系图失败: {str(e)}", exc_info=True)
        return api_response(False, f"获取依赖关系图失败: {str(e)}", status_code=500)

# 导入新增模块
import subprocess
import platform
import os.path

# 获取所有Python环境
@app.route('/api/python-environments')
def get_python_environments():
    """获取所有已配置的Python环境"""
    try:
        environments = config.load_python_environments()
        
        # 如果是首次运行且没有环境，尝试添加当前环境
        if not environments.get("environments") and environments.get("current") is None:
            current_env = {
                "id": "system",
                "name": "当前Python环境",
                "path": sys.executable,
                "type": "system",
                "version": sys.version.split()[0]
            }
            environments["environments"] = [current_env]
            environments["current"] = "system"
            config.save_python_environments(environments)
        
        return jsonify(environments)
    except Exception as e:
        utils.print_status(f"获取Python环境列表失败: {e}", 'error')
        return api_response(False, f"获取Python环境列表失败: {str(e)}", status_code=500)

# 保存Python环境
@app.route('/api/python-environments', methods=['POST'])
def save_python_environment():
    """新增或修改Python环境"""
    try:
        data = request.json
        
        # 加载现有环境
        environments = config.load_python_environments()
        
        # 生成唯一ID
        import uuid
        env_id = data.get("id") or str(uuid.uuid4())
        
        # 验证环境路径
        python_path = data.get("path", "")
        if not python_path or not os.path.exists(python_path):
            return api_response(False, "Python可执行文件路径无效", status_code=400)
        
        # 获取Python版本
        try:
            version_process = subprocess.run(
                [python_path, "--version"], 
                capture_output=True, 
                text=True,
                check=True
            )
            version = version_process.stdout.strip() or version_process.stderr.strip()
            version = version.replace("Python ", "")
        except Exception as e:
            return api_response(False, f"无法获取Python版本: {str(e)}", status_code=400)
        
        # 创建或更新环境
        new_env = {
            "id": env_id,
            "name": data.get("name", f"Python {version}"),
            "path": python_path,
            "type": data.get("type", "custom"),
            "version": version
        }
        
        # 更新或添加环境
        updated = False
        for i, env in enumerate(environments["environments"]):
            if env["id"] == env_id:
                environments["environments"][i] = new_env
                updated = True
                break
        
        if not updated:
            environments["environments"].append(new_env)
        
        # 保存更新
        if not config.save_python_environments(environments):
            return api_response(False, "保存环境配置失败", status_code=500)
        
        return api_response(True, "环境已保存", {"environment": new_env})
        
    except Exception as e:
        utils.print_status(f"保存Python环境失败: {e}", 'error')
        return api_response(False, f"保存Python环境失败: {str(e)}", status_code=500)

# 删除Python环境
@app.route('/api/python-environments/<env_id>', methods=['DELETE'])
def delete_python_environment(env_id):
    """删除Python环境"""
    try:
        # 加载现有环境
        environments = config.load_python_environments()
        
        # 检查是否是当前环境
        if environments.get("current") == env_id:
            return api_response(False, "不能删除当前使用的环境", status_code=400)
        
        # 查找和删除环境
        found = False
        for i, env in enumerate(environments["environments"]):
            if env["id"] == env_id:
                del environments["environments"][i]
                found = True
                break
        
        if not found:
            return api_response(False, "环境不存在", status_code=404)
        
        # 保存更新
        if not config.save_python_environments(environments):
            return api_response(False, "保存环境配置失败", status_code=500)
        
        return api_response(True, "环境已删除")
        
    except Exception as e:
        utils.print_status(f"删除Python环境失败: {e}", 'error')
        return api_response(False, f"删除Python环境失败: {str(e)}", status_code=500)

# 修改切换环境API
@app.route('/api/switch-environment', methods=['POST'])
def switch_environment():
    """切换到指定的Python环境"""
    try:
        data = request.json
        env_id = data.get("environmentId")
        
        if not env_id:
            return api_response(False, "环境ID不能为空", status_code=400)
        
        # 加载环境配置
        environments = config.load_python_environments()
        
        # 查找目标环境
        target_env = None
        for env in environments["environments"]:
            if env["id"] == env_id:
                target_env = env
                break
        
        if not target_env:
            return api_response(False, "目标环境不存在", status_code=404)
        
        # 检查环境可执行文件是否存在
        python_path = target_env["path"]
        if not os.path.exists(python_path):
            return api_response(False, "Python可执行文件路径无效", status_code=400)
            
        # 检查是否是当前环境
        current_env_id = environments.get("current")
        if current_env_id == env_id:
            return api_response(True, "已经是当前环境", {"environment": target_env, "needsRefresh": False})
            
        # 更新当前环境
        environments["current"] = env_id
        if not config.save_python_environments(environments):
            return api_response(False, "保存环境配置失败", status_code=500)
            
        # 返回成功信息，无需重启应用
        return api_response(True, "环境切换成功", {
            "requiresRestart": False, 
            "needsRefresh": True,
            "environment": target_env
        })
        
    except Exception as e:
        utils.print_status(f"切换Python环境失败: {e}", 'error')
        return api_response(False, f"切换Python环境失败: {str(e)}", status_code=500)

# 浏览Python环境
@app.route('/api/browse-python-env', methods=['POST'])
def browse_python_env():
    """浏览并查找Python环境"""
    try:
        # 根据操作系统，搜索常见的Python安装位置
        os_type = platform.system().lower()
        potential_paths = []
        
        if os_type == 'windows':
            # 检查常见Windows Python安装位置
            drives = ['C:', 'D:', 'E:', 'F:']
            for drive in drives:
                # 搜索标准Python安装
                potential_paths.extend([
                    os.path.join(drive, r'Python*\python.exe'),
                    os.path.join(drive, r'Program Files\Python*\python.exe'),
                    os.path.join(drive, r'Program Files (x86)\Python*\python.exe'),
                    os.path.join(drive, r'Users\*\AppData\Local\Programs\Python\Python*\python.exe'),
                    os.path.join(drive, r'ProgramData\Anaconda*\python.exe'),
                    os.path.join(drive, r'Users\*\anaconda*\python.exe'),
                    os.path.join(drive, r'Users\*\miniconda*\python.exe'),
                    os.path.join(drive, r'Users\*\Anaconda*\python.exe'),
                    os.path.join(drive, r'Users\*\Miniconda*\python.exe'),
                ])
                # 搜索虚拟环境
                potential_paths.extend([
                    os.path.join(drive, r'Users\*\*env*\Scripts\python.exe'),
                    os.path.join(drive, r'*env*\Scripts\python.exe'),
                ])
        elif os_type in ['linux', 'darwin']:  # Linux or macOS
            # 检查常见Unix-like系统Python位置
            potential_paths.extend([
                '/usr/bin/python*',
                '/usr/local/bin/python*',
                '/opt/anaconda*/bin/python',
                '/opt/miniconda*/bin/python',
                os.path.expanduser('~/anaconda*/bin/python'),
                os.path.expanduser('~/miniconda*/bin/python'),
                os.path.expanduser('~/.virtualenvs/*/bin/python'),
                os.path.expanduser('~/venv*/bin/python'),
                os.path.expanduser('~/*env*/bin/python'),
            ])
        
        # 执行搜索并验证找到的Python路径
        found_environments = []
        
        for pattern in potential_paths:
            try:
                import glob
                paths = glob.glob(pattern)
                
                for path in paths:
                    if os.path.isfile(path) and os.access(path, os.X_OK):
                        try:
                            # 验证是否是有效的Python可执行文件
                            version_process = subprocess.run(
                                [path, "--version"], 
                                capture_output=True, 
                                text=True,
                                timeout=2  # 设置超时避免挂起
                            )
                            if version_process.returncode == 0:
                                version_output = version_process.stdout.strip() or version_process.stderr.strip()
                                if "Python" in version_output:
                                    version = version_output.replace("Python ", "").strip()
                                    
                                    # 生成环境名称
                                    dirs = path.split(os.sep)
                                    env_name = f"Python {version}"
                                    
                                    # 尝试从路径推断更好的名称
                                    for i in range(len(dirs)-2, 0, -1):
                                        if "env" in dirs[i].lower() or "conda" in dirs[i].lower() or "python" in dirs[i].lower():
                                            env_name = f"{dirs[i]} ({version})"
                                            break
                                    
                                    # 确定环境类型
                                    env_type = "system"
                                    if "virtualenv" in path.lower() or "venv" in path.lower():
                                        env_type = "virtualenv"
                                    elif "conda" in path.lower():
                                        env_type = "conda"
                                    elif "portable" in path.lower():
                                        env_type = "portable"
                                    
                                    # 添加到找到的环境列表
                                    found_environments.append({
                                        "path": path,
                                        "version": version,
                                        "name": env_name,
                                        "type": env_type
                                    })
                        except Exception as e:
                            print(f"验证Python路径 {path} 时出错: {str(e)}")
            except Exception as e:
                print(f"搜索模式 {pattern} 时出错: {str(e)}")
        
        # 去除重复项
        unique_environments = []
        seen_paths = set()
        
        for env in found_environments:
            if env["path"] not in seen_paths:
                seen_paths.add(env["path"])
                unique_environments.append(env)
        
        return api_response(True, f"找到 {len(unique_environments)} 个Python环境", {
            "environments": unique_environments
        })
        
    except Exception as e:
        utils.print_status(f"浏览Python环境失败: {e}", 'error')
        return api_response(False, f"浏览Python环境失败: {str(e)}", status_code=500)

# 获取单个依赖的详细信息
@app.route('/api/dependency/<package_name>')
def get_single_dependency(package_name):
    """获取单个依赖的详细信息，支持安装/卸载/更新后的增量刷新"""
    try:
        # 检查是否强制刷新PyPI缓存
        force_refresh = request.args.get('force_refresh', 'false').lower() == 'true'
        
        # 获取单个依赖的信息
        dep_info = dependency.get_single_dependency_info(package_name, force_refresh)
        
        if dep_info:
            return jsonify(dep_info)
        else:
            return api_response(False, f"依赖 {package_name} 未安装或不存在", status_code=404)
    except Exception as e:
        utils.print_status(f"获取依赖 {package_name} 信息失败: {e}", 'error')
        return api_response(False, f"获取依赖信息失败: {str(e)}", status_code=500)
