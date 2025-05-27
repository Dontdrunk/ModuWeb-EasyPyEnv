"""
核心模块 - 提供配置管理和通用工具函数

此模块合并了原来的config.py和utils.py，提供：
- 应用程序配置管理
- 缓存和设置处理
- 彩色输出和状态显示
- 任务管理功能
- 文件操作工具
- 进程输出处理
"""

import os
import sys
import time
import json
import subprocess
import threading
import re
import shlex
import contextlib

# ===========================================
# 配置管理部分 (原 config.py)
# ===========================================

# 配置目录路径
CONFIG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'config')

# 依赖描述缓存文件路径
CACHE_FILE = os.path.join(CONFIG_DIR, 'dependency_cache.json')
# 依赖配置文件路径
DEPENDENCIES_CONFIG_FILE = os.path.join(CONFIG_DIR, 'dependencies_config.json')
# 环境配置文件路径
PYTHON_ENVS_FILE = os.path.join(CONFIG_DIR, 'python_environments.json')

# 确保配置目录存在
if not os.path.exists(CONFIG_DIR):
    try:
        os.makedirs(CONFIG_DIR)
    except Exception as e:
        print(f"创建config目录失败: {e}")

# 加载依赖配置
def load_dependencies_config():
    """
    加载依赖配置文件，获取系统依赖、核心依赖等配置信息
    
    Returns:
        dict: 依赖配置字典
    """
    if os.path.exists(DEPENDENCIES_CONFIG_FILE):
        try:
            with open(DEPENDENCIES_CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"加载依赖配置文件失败: {e}")
    
    # 如果配置文件不存在或加载失败，返回默认配置
    return {
        "systemDependencies": [
            "pip", "setuptools", "wheel", "flask", "flask-cors", "requests", "packaging"
        ],
        "dataScienceDependencies": ["numpy", "pandas"],
        "aiDependencies": ["transformers"],
        "softwareDependencies": [
            "flask", "flask-cors", "requests"
        ]
    }

# 加载依赖描述缓存
def load_description_cache():
    """
    加载缓存的依赖描述信息
    
    Returns:
        dict: 依赖描述缓存字典
    """
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content:  # 检查文件是否为空
                    return json.loads(content)
                else:
                    print("依赖描述缓存文件为空，将使用空缓存")
                    return {}
        except json.JSONDecodeError:
            print("依赖描述缓存文件格式无效，将使用空缓存")
            return {}
        except Exception as e:
            print(f"加载缓存文件失败: {e}")
            return {}
    return {}

# 保存依赖描述到缓存
def save_description_cache(dependency_descriptions):
    """
    保存依赖描述到缓存文件
    
    Args:
        dependency_descriptions (dict): 依赖描述字典
        
    Returns:
        bool: 是否保存成功
    """
    try:
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(dependency_descriptions, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"保存缓存文件失败: {e}")
        return False

# 获取缓存信息
def get_cache_info():
    """
    获取缓存状态信息
    
    Returns:
        dict: 缓存信息字典
    """
    latest_versions_cache_file = os.path.join(CONFIG_DIR, 'latest_versions_cache.json')
    
    cache_info = {
        'exists': False,
        'last_update': None
    }
    
    if os.path.exists(latest_versions_cache_file):
        try:
            with open(latest_versions_cache_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict) and 'last_update' in data:
                    cache_info['exists'] = True
                    cache_info['last_update'] = data['last_update']
                elif isinstance(data, dict) and len(data) > 0:
                    # 旧版缓存格式兼容处理
                    cache_info['exists'] = True
                    # 使用文件修改时间作为最后更新时间
                    cache_info['last_update'] = os.path.getmtime(latest_versions_cache_file)
        except Exception as e:
            print(f"读取缓存信息失败: {e}")
    
    return cache_info

# 检查缓存是否有效
def is_cache_valid():
    """
    检查缓存是否在有效期内
    
    Returns:
        bool: 缓存是否有效
    """
    cache_info = get_cache_info()
    
    if not cache_info['exists'] or not cache_info['last_update']:
        print('缓存不存在或无效，将执行版本检查')
        return False
    
    # 检查缓存是否在有效期内
    last_update_time = cache_info['last_update'] * 1000  # 转为毫秒
    current_time = time.time() * 1000
    cache_age_in_days = (current_time - last_update_time) / (1000 * 60 * 60 * 24)
    
    print(f"缓存年龄: {cache_age_in_days:.2f}天, 缓存{'有效' if cache_age_in_days < 1 else '失效'}")
    
    return cache_age_in_days < 1

# 加载Python环境配置
def load_python_environments():
    """
    加载已保存的Python环境配置
    
    Returns:
        dict: Python环境配置字典，包含路径和类型
    """
    default_environments = {
        "environments": [],
        "current": None
    }
    
    if os.path.exists(PYTHON_ENVS_FILE):
        try:
            with open(PYTHON_ENVS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"加载Python环境配置文件失败: {e}")
    
    # 如果配置文件不存在或加载失败，创建默认配置文件
    save_python_environments(default_environments)
    return default_environments

# 保存Python环境配置
def save_python_environments(environments):
    """
    保存Python环境配置到文件
    
    Args:
        environments (dict): Python环境配置
        
    Returns:
        bool: 是否保存成功
    """
    try:
        with open(PYTHON_ENVS_FILE, 'w', encoding='utf-8') as f:
            json.dump(environments, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"保存Python环境配置失败: {e}")
        return False

# 添加获取当前活动Python环境路径函数
def get_active_python_executable():
    """
    获取当前活动的Python可执行文件路径
    
    Returns:
        str: Python可执行文件路径
    """
    environments = load_python_environments()
    current_env_id = environments.get('current')
    
    if not current_env_id:
        # 默认使用当前Python
        return sys.executable
    
    # 查找当前环境信息
    for env in environments.get('environments', []):
        if env.get('id') == current_env_id and os.path.exists(env.get('path', '')):
            return env.get('path')
    
    # 如果找不到有效的环境，返回当前Python
    return sys.executable

# ===========================================
# 工具函数部分 (原 utils.py)
# ===========================================

# 彩色输出配置
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

# 全局任务进度跟踪字典
task_progress = {}

# 格式化中文提示输出
def print_status(message, status='info'):
    """
    打印带颜色的状态消息
    
    Args:
        message (str): 要打印的消息
        status (str): 消息类型 ('success', 'error', 'warning', 'start', 'info')
    """
    if status == 'success':
        print(f"{Colors.GREEN}【成功】{message}{Colors.ENDC}")
    elif status == 'error':
        print(f"{Colors.FAIL}【错误】{message}{Colors.ENDC}")
    elif status == 'warning':
        print(f"{Colors.WARNING}【警告】{message}{Colors.ENDC}")
    elif status == 'start':
        print(f"{Colors.BLUE}【开始】{message}{Colors.ENDC}")
    else:
        print(f"{Colors.BOLD}【信息】{message}{Colors.ENDC}")

# 封装安全的文件读写操作
@contextlib.contextmanager
def safe_open_file(file_path, mode='r', encoding='utf-8'):
    """
    安全打开文件的上下文管理器
    
    Args:
        file_path (str): 文件路径
        mode (str): 打开模式
        encoding (str): 文件编码
        
    Yields:
        file: 打开的文件对象
    """
    try:
        f = open(file_path, mode, encoding=encoding)
        yield f
    except Exception as e:
        print(f"文件操作失败 [{file_path}]: {e}")
        raise
    finally:
        if 'f' in locals():
            f.close()

# 通用任务管理函数
def create_task(task_type, items):
    """
    创建一个新任务
    
    Args:
        task_type (str): 任务类型
        items (list): 任务项列表
        
    Returns:
        str: 任务ID
    """
    import uuid
    task_id = str(uuid.uuid4())
    task_progress[task_id] = {
        'progress': 0,
        'total': len(items),
        'current': 0,
        'status': 'running',
        'message': f'准备{task_type}',
        'errors': []
    }
    return task_id

def update_task_progress(task_id, current, message=None):
    """
    更新任务进度
    
    Args:
        task_id (str): 任务ID
        current (int): 当前进度
        message (str, optional): 进度消息
    """
    if task_id not in task_progress:
        return
    
    task = task_progress[task_id]
    task['current'] = current
    task['progress'] = int((current / task['total']) * 100) if task['total'] > 0 else 0
    
    if message:
        task['message'] = message

def complete_task(task_id, errors=None):
    """
    完成任务
    
    Args:
        task_id (str): 任务ID
        errors (list, optional): 错误列表
    """
    if task_id not in task_progress:
        return
    
    task_progress[task_id]['status'] = 'completed'
    task_progress[task_id]['progress'] = 100
    task_progress[task_id]['message'] = '处理完成'
    
    if errors:
        task_progress[task_id]['errors'] = errors
    
    # 安排任务清理
    schedule_task_cleanup(task_id)

def schedule_task_cleanup(task_id, delay=86400):
    """
    安排任务清理
    
    Args:
        task_id (str): 任务ID
        delay (int): 延迟时间（秒）
    """
    def cleanup_task():
        time.sleep(delay)  # 默认24小时后清理
        if task_id in task_progress:
            del task_progress[task_id]
    
    threading.Thread(target=cleanup_task, daemon=True).start()

# 通用批量处理功能
def process_batch_operation(packages, task_id, operation_func, should_skip_func=None, skip_message=""):
    """
    通用批量操作处理
    
    Args:
        packages (list): 包名称列表
        task_id (str): 任务ID
        operation_func (callable): 操作函数
        should_skip_func (callable, optional): 判断是否应该跳过的函数
        skip_message (str, optional): 跳过时的消息
    """
    errors = []
    total = len(packages)
    
    for index, pkg in enumerate(packages):
        try:
            # 检查是否应该跳过
            if should_skip_func and should_skip_func(pkg):
                errors.append(f"{pkg}: {skip_message}")
                continue
            
            # 更新进度
            update_task_progress(
                task_id, 
                index + 1, 
                f'处理 {pkg} ({index + 1}/{total})'
            )
            
            # 执行操作
            operation_func(pkg)
            
        except Exception as e:
            errors.append(f"{pkg}: {str(e)}")
    
    # 完成任务
    complete_task(task_id, errors)

def stream_process_output(cmd, task_id, package_name=None):
    """
    流式处理命令输出并更新进度条
    
    Args:
        cmd (list or str): 命令及参数
        task_id (str): 任务ID
        package_name (str, optional): 包名称
        
    Returns:
        bool: 命令是否成功执行
    """
    try:
        # 设置初始进度
        update_task_progress(task_id, 0, f'开始处理 {package_name or cmd}...')
        
        # 分割命令为参数列表
        if isinstance(cmd, str):
            cmd = shlex.split(cmd)
            
        # 启动进程并捕获实时输出
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True
        )
        
        # 用于跟踪进度的变量
        download_started = False
        current_percent = 0
        current_status = f'准备 {package_name or "任务"}...'
        
        # 正则表达式用于匹配不同类型的进度输出
        progress_pattern = re.compile(r'(\d+)%\|.*\| (\d+(\.\d+)?)([kKmMgG]i?B)/(\d+(\.\d+)?)([kKmMgG]i?B)')
        simple_percent_pattern = re.compile(r'(\d+)%')
        step_pattern = re.compile(r'(Building|Collecting|Installing|Processing)\s+([^\s]+)')
        
        # 处理每一行输出
        for line in iter(process.stdout.readline, ''):
            line = line.strip()
            
            # 跳过空行
            if not line:
                continue
                
            # 打印原始输出
            print(line)
            
            # 尝试解析进度信息
            progress_match = progress_pattern.search(line)
            simple_match = simple_percent_pattern.search(line)
            step_match = step_pattern.search(line)
            
            # 如果找到进度百分比信息 (例如: "45%|████      | 3.6/8.1MB")
            if progress_match:
                percent = int(progress_match.group(1))
                downloaded_str = progress_match.group(2)
                downloaded_unit = progress_match.group(4)
                total_str = progress_match.group(5)
                total_unit = progress_match.group(7)
                
                # 更新进度信息
                download_started = True
                current_percent = percent
                current_status = f"下载中: {downloaded_str}{downloaded_unit}/{total_str}{total_unit} ({percent}%)"
                
                # 创建命令行进度条
                progress_bar = create_cli_progress_bar(percent)
                print(f"\r{progress_bar} {current_status}", end="")
                
                # 更新任务进度
                update_task_progress(task_id, percent, current_status)
            
            # 简单百分比匹配 (例如: "Installing... 30%")
            elif simple_match and not progress_match:
                percent = int(simple_match.group(1))
                if percent > current_percent:  # 只更新更高的进度
                    current_percent = percent
                    current_status = f"处理中: {percent}%"
                    # 创建命令行进度条
                    progress_bar = create_cli_progress_bar(percent)
                    print(f"\r{progress_bar} {current_status}", end="")
                    
                    # 更新任务进度
                    update_task_progress(task_id, percent, current_status)
            
            # 如果找到步骤信息 (例如: "Collecting numpy" 或 "Installing collected packages: pip")
            elif step_match:
                action = step_match.group(1)
                package = step_match.group(2)
                
                # 根据不同步骤设置不同的进度
                if action == "Collecting" and not download_started:
                    update_task_progress(task_id, 10, f"收集依赖包: {package}")
                    current_status = f"收集依赖包: {package}"
                elif action == "Building":
                    update_task_progress(task_id, max(30, current_percent), f"构建包: {package}")
                    current_status = f"构建包: {package}"
                elif action == "Installing":
                    update_task_progress(task_id, max(70, current_percent), f"安装包: {package}")
                    current_status = f"安装包: {package}"
            
            # 对于没有明确进度信息的行，至少提供一些状态更新
            else:
                # 检查是否是某些特殊状态
                if "Successfully installed" in line:
                    current_percent = 100
                    installed_packages = line.replace("Successfully installed", "").strip()
                    current_status = f"成功安装: {installed_packages}"
                    update_task_progress(task_id, 100, current_status)
                    print(f"\r{create_cli_progress_bar(100)} {current_status}")
                elif "Requirement already satisfied" in line:
                    package_info = line.replace("Requirement already satisfied:", "").strip().split()[0]
                    current_status = f"依赖已满足: {package_info}"
                    update_task_progress(task_id, max(50, current_percent), current_status)
        
        # 等待进程完成并获取返回码
        return_code = process.wait()
        
        # 确保进度条显示完成
        if current_percent < 100 and return_code == 0:
            update_task_progress(task_id, 100, "处理完成")
            print(f"\r{create_cli_progress_bar(100)} 处理完成")
        
        # 确保光标移到下一行
        print()
        
        # 返回进程状态
        return return_code == 0
    
    except Exception as e:
        print(f"处理命令输出时出错: {e}")
        update_task_progress(task_id, 100, f"处理出错: {str(e)}")
        return False

def create_cli_progress_bar(percent, width=30):
    """
    创建命令行ASCII进度条
    
    Args:
        percent (int): 进度百分比
        width (int): 进度条宽度
        
    Returns:
        str: ASCII进度条字符串
    """
    completed = int(width * percent / 100)
    remaining = width - completed
    return f"[{'#' * completed}{' ' * remaining}] {percent}%"

# ===========================================
# 模块初始化
# ===========================================

# 加载所有配置
dependency_config = load_dependencies_config()
SYSTEM_DEPENDENCIES = dependency_config.get('systemDependencies', [])
CORE_DEPENDENCIES = dependency_config.get('dataScienceDependencies', [])
AI_MODEL_DEPENDENCIES = dependency_config.get('aiDependencies', [])
APP_DEPENDENCIES = dependency_config.get('softwareDependencies', [])
