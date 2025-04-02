"""
工具模块 - 提供各类通用工具函数和辅助功能

此模块包含：
- 彩色输出配置
- 任务管理功能
- 安全文件操作
- 进程输出处理
- 其他通用工具函数
"""

import os
import sys
import time
import subprocess
import threading
import json
import re
import shlex
import contextlib

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
