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
    current_time = time.time()
    
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
