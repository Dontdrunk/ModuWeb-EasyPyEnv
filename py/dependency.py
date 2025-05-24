"""
依赖管理模块 - 处理与Python包依赖相关的功能

此模块负责：
- 获取已安装的Python依赖信息
- 分类和处理依赖数据
- 提供依赖安装、卸载、更新和版本切换功能
- 处理批量操作和任务管理
"""

import os
import sys
import json
import time
import subprocess
import threading
import tempfile
import shutil
import requests
import re
from packaging import version

if sys.version_info < (3,8):
    from importlib_metadata import distributions
else:
    from importlib.metadata import distributions

# 导入自定义模块
from . import config
from . import utils

# 从config模块导入配置数据
SYSTEM_DEPENDENCIES = config.SYSTEM_DEPENDENCIES
CORE_DEPENDENCIES = config.CORE_DEPENDENCIES
AI_MODEL_DEPENDENCIES = config.AI_MODEL_DEPENDENCIES
APP_DEPENDENCIES = config.APP_DEPENDENCIES
CONFIG_DIR = config.CONFIG_DIR

# 依赖描述缓存
dependency_descriptions = {}

# 加载缓存的依赖描述
def load_descriptions():
    """
    加载依赖描述缓存
    
    Returns:
        dict: 依赖描述字典
    """
    global dependency_descriptions
    dependency_descriptions = config.load_description_cache()
    return dependency_descriptions

# 保存依赖描述缓存
def save_descriptions():
    """
    保存依赖描述到缓存文件
    
    Returns:
        bool: 是否成功保存
    """
    return config.save_description_cache(dependency_descriptions)

# 异步更新依赖描述
def async_update_descriptions(only_missing=True):
    """
    异步更新依赖描述（在后台线程中执行）
    
    该函数会访问PyPI API获取每个依赖的详细描述
    
    Args:
        only_missing (bool): 如果为True，只更新缺少描述的依赖，否则更新所有依赖
    """
    try:
        updated = False
        missing_deps = []
        
        # 获取当前激活的Python环境路径
        python_executable = config.get_active_python_executable()
        
        # 如果非only_missing模式 (环境已变更)，记录日志
        if not only_missing:
            utils.print_status(f"环境切换后，将更新所有依赖的描述", 'info')
        
        # 创建一个临时脚本，用于获取依赖列表
        script = """
import sys
import json
try:
    if sys.version_info < (3,8):
        from importlib_metadata import distributions
    else:
        from importlib.metadata import distributions
    
    deps = []
    for dist in distributions():
        try:
            pkg_name = dist.metadata['Name'].lower() if 'Name' in dist.metadata else dist.metadata.get('name', '').lower()
            if not pkg_name:
                continue
            deps.append(pkg_name)
        except Exception as e:
            print(f"Error processing {dist}: {e}", file=sys.stderr)
    
    print(json.dumps(deps))
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
"""
        # 创建临时文件
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as temp_file:
            temp_path = temp_file.name
            temp_file.write(script)
        
        try:
            # 执行脚本获取依赖列表
            utils.print_status(f"正在使用 {python_executable} 获取当前环境的依赖列表", 'info')
            
            result = subprocess.run(
                [python_executable, temp_path],
                capture_output=True, 
                text=True
            )
            
            if result.returncode != 0:
                utils.print_status(f"获取依赖失败: {result.stderr}", 'error')
                return
            
            # 解析脚本输出获取所有依赖包名
            package_list = json.loads(result.stdout.strip())
            utils.print_status(f"当前环境共有 {len(package_list)} 个依赖包", 'info')
            
            # 不论是否环境变更，始终只更新缺失的描述
            # 统计缺失的依赖
            current_keys = set(package_list)
            old_keys = set(dependency_descriptions.keys())
            missing_keys = current_keys - old_keys
            
            if missing_keys:
                utils.print_status(f"发现 {len(missing_keys)} 个需要获取描述的新包", 'info')
                # 只把真正缺失描述的包添加到更新列表
                missing_deps = list(missing_keys)
            else:
                utils.print_status("当前环境中的所有依赖描述都已是最新状态", 'info')
                
                # 即使没有缺失的描述，当环境变更时也更新时间戳以触发前端刷新
                if not only_missing:
                    if not hasattr(sys.modules[__name__], 'last_description_update'):
                        sys.modules[__name__].last_description_update = time.time()
                    else:
                        sys.modules[__name__].last_description_update = time.time()
                    
                return
            
        finally:
            # 清理临时文件
            try:
                os.unlink(temp_path)
            except:
                pass
        
        # 如果有需要更新描述的依赖，打印日志
        if missing_deps:
            utils.print_status(f"发现 {len(missing_deps)} 个需要更新描述的依赖，将在后台更新", 'info')
            
        # 获取需要更新的依赖的描述
        for pkg_name in missing_deps:
            try:
                # 从PyPI获取依赖描述
                response = requests.get(f"https://pypi.org/pypi/{pkg_name}/json", timeout=5)
                if response.status_code == 200:
                    data = response.json()
                    description = data.get('info', {}).get('summary', "")
                    dependency_descriptions[pkg_name] = description
                    updated = True
            except Exception as e:
                utils.print_status(f"更新 {pkg_name} 的描述时出错: {e}", 'warning')
        
        if updated:
            utils.print_status(f"已更新 {len(missing_deps)} 个依赖的描述", 'info')
            save_descriptions()
            # 标记更新时间戳，这个会被暴露给API模块使用
            if not hasattr(sys.modules[__name__], 'last_description_update'):
                sys.modules[__name__].last_description_update = time.time()
            else:
                sys.modules[__name__].last_description_update = time.time()
        elif not missing_deps:
            utils.print_status("当前环境中的所有依赖描述都已是最新状态", 'info')
    except Exception as e:
        utils.print_status(f"异步更新依赖描述时出错: {e}", 'error')

# 获取所有已安装的依赖信息
def get_all_dependencies(use_cache=True):
    """
    获取所有已安装的Python依赖信息
    
    Args:
        use_cache (bool): 是否清除PyPI最新版本缓存。如果为False，将清除缓存，强制重新获取最新版本
        
    Returns:
        list: 依赖信息列表
    """
    dependencies = []
      # 如果不使用缓存，清理过期的PyPI版本缓存条目，而不是完全清空
    if not use_cache:
        global _pypi_version_cache
        refresh_version_cache()
    
    # 不再使用缓存文件，直接使用字典保存处理过程中的信息
    dependency_dict = {}
    
    # 获取当前激活的Python环境路径
    python_executable = config.get_active_python_executable()
    
    # 使用subprocess直接调用指定的Python环境获取依赖列表
    try:
        # 创建一个临时脚本，用于获取依赖列表
        script = """
import sys
import json
try:
    if sys.version_info < (3,8):
        from importlib_metadata import distributions
    else:
        from importlib.metadata import distributions
    
    deps = []
    for dist in distributions():
        try:
            pkg_name = dist.metadata['Name'].lower() if 'Name' in dist.metadata else dist.metadata.get('name', '').lower()
            if not pkg_name:
                continue
            deps.append({
                'name': pkg_name,
                'version': dist.version
            })
        except Exception as e:
            print(f"Error processing {dist}: {e}", file=sys.stderr)
    
    print(json.dumps(deps))
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
"""
        # 创建临时文件
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as temp_file:
            temp_path = temp_file.name
            temp_file.write(script)
        
        try:
            # 执行脚本获取依赖列表
            result = subprocess.run(
                [python_executable, temp_path],
                capture_output=True, 
                text=True
            )
            
            if result.returncode != 0:
                utils.print_status(f"获取依赖失败: {result.stderr}", 'error')
                return []
            
            # 解析脚本输出
            deps_data = json.loads(result.stdout.strip())
            
            # 处理依赖数据
            for dep_info in deps_data:
                pkg_name = dep_info['name']
                pkg_version = dep_info['version']
                  # 如果该包名已存在，检查版本并保留更新的版本
                if pkg_name in dependency_dict:
                    existing_version = dependency_dict[pkg_name]['version']
                    current_version = pkg_version
                    
                    try:
                        # 比较版本，保留更高的版本
                        existing_ver = version.parse(existing_version)
                        current_ver = version.parse(current_version)
                        
                        # 如果当前版本更低，跳过
                        if current_ver <= existing_ver:
                            continue
                    except Exception as e:
                        utils.print_status(f"版本比较出错 {pkg_name}: {e}", 'warning')
                        # 出错时默认保留已有版本
                        continue
                
                is_system = pkg_name in SYSTEM_DEPENDENCIES
                is_core = pkg_name in CORE_DEPENDENCIES
                is_ai_model = pkg_name in AI_MODEL_DEPENDENCIES
                is_app_required = pkg_name in APP_DEPENDENCIES
                description = dependency_descriptions.get(pkg_name, "")
                
                # 实时获取最新版本信息（在PyPI上查询）
                latest_version = ""
                is_latest = False
                
                try:
                    # 只对非系统和非应用依赖进行版本检查
                    if not is_system and not is_app_required:
                        pypi_info = get_latest_version_from_pypi(pkg_name)
                        if pypi_info.get('version'):
                            latest_version = pypi_info['version']
                            
                            # 直接使用标准化的版本比较函数
                            norm_current = normalize_version(pkg_version)
                            norm_latest = normalize_version(latest_version)
                            is_latest = (norm_current == norm_latest)
                            
                            # 如果标准化版本不相等，使用精确的版本比较
                            if not is_latest:
                                try:
                                    current_ver = version.parse(pkg_version)
                                    latest_ver = version.parse(latest_version)
                                    is_latest = (current_ver >= latest_ver)
                                except Exception:
                                    # 如果精确比较失败，使用简化比较
                                    is_latest = (pkg_version == latest_version)
                except Exception as e:
                    utils.print_status(f"获取{pkg_name}的最新版本信息失败: {e}", 'warning')
                    # 出错时默认为非最新版本
                    is_latest = False
                
                # 存储依赖信息到字典中，以防止重复
                dependency_dict[pkg_name] = {
                    'name': pkg_name,
                    'version': pkg_version,
                    'description': description,
                    'isSystem': is_system,
                    'isCore': is_core,
                    'isAIModel': is_ai_model,
                    'isAppRequired': is_app_required,
                    'isLatest': is_latest,
                    'latestVersion': latest_version
                }
                
        finally:
            # 清理临时文件
            try:
                os.unlink(temp_path)
            except:
                pass
    except Exception as e:
        utils.print_status(f"获取依赖列表失败: {e}", 'error')
        return []
    
    # 将字典值转换为列表
    dependencies = list(dependency_dict.values())
    
    return dependencies

# PyPI版本信息缓存，避免重复请求，添加时间戳
_pypi_version_cache = {}

# 基于时间的缓存刷新
def refresh_version_cache(force_refresh=False):
    """
    基于时间刷新PyPI版本缓存
    
    清理过期的PyPI版本缓存条目，而不是完全清空缓存
    
    Args:
        force_refresh (bool): 如果为True，则强制刷新所有缓存
    """
    global _pypi_version_cache
    import time
    
    # 计算过期时间 (24小时)
    current_time = time.time()
    expire_time = current_time - (24 * 60 * 60)
    
    if force_refresh:
        # 强制刷新模式下，清空所有缓存
        _pypi_version_cache = {}
        return
    
    # 查找并移除过期的缓存条目
    expired_keys = []
    for pkg_name, pkg_data in _pypi_version_cache.items():
        if 'timestamp' not in pkg_data or pkg_data['timestamp'] < expire_time:
            expired_keys.append(pkg_name)
    
    # 从缓存中移除过期条目
    for key in expired_keys:
        _pypi_version_cache.pop(key, None)
    
    # 如果有条目被移除，输出日志
    if expired_keys:
        from . import utils
        utils.print_status(f"已清理 {len(expired_keys)} 个过期的PyPI版本缓存条目", 'info')

def get_latest_version_from_pypi(package_name, force_refresh=False):
    """
    从PyPI获取包的最新版本信息，使用带时间戳的缓存
    
    Args:
        package_name (str): 包名
        force_refresh (bool): 是否强制刷新，忽略缓存
    
    Returns:
        dict: 包含版本信息的字典
    """
    import time
    current_time = time.time()
    
    # 检查缓存是否有效（24小时内）
    if not force_refresh and package_name in _pypi_version_cache:
        cache_entry = _pypi_version_cache[package_name]
        # 检查时间戳是否存在且未过期
        if 'timestamp' in cache_entry and current_time - cache_entry['timestamp'] < 24 * 60 * 60:
            return cache_entry
    
    try:
        url = f"https://pypi.org/pypi/{package_name}/json"
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            version_info = {
                'version': data.get('info', {}).get('version', ''),
                'releases': data.get('releases', {}),
                'timestamp': current_time  # 添加时间戳
            }
            _pypi_version_cache[package_name] = version_info
            return version_info
        else:
            return {'version': '', 'timestamp': current_time}
    except Exception as e:
        utils.print_status(f"获取{package_name}的PyPI信息失败: {e}", 'warning')
        return {'version': '', 'timestamp': current_time}

# 版本标准化函数
def normalize_version(version_str):
    """
    标准化版本字符串，移除后缀，便于比较
    
    Args:
        version_str (str): 版本字符串
    
    Returns:
        str: 标准化后的版本字符串
    """
    if not version_str:
        return ""
    
    # 移除常见后缀
    version_str = str(version_str)
    
    # 移除.postX后缀
    if '.post' in version_str:
        version_str = version_str.split('.post')[0]
    
    # 移除预发布标识
    for prefix in ['a', 'b', 'rc', 'dev', 'alpha', 'beta', 'pre']:
        if f'.{prefix}' in version_str:
            version_str = version_str.split(f'.{prefix}')[0]
        if f'-{prefix}' in version_str:
            version_str = version_str.split(f'-{prefix}')[0]
    
    return version_str

# 卸载依赖
def uninstall_dependency(dependency):
    """
    卸载单个依赖
    
    Args:
        dependency (str): 依赖名称
        
    Returns:
        tuple: (success, message) 元组
    """
    try:
        # 检查是否是系统依赖或应用依赖
        if dependency.lower() in SYSTEM_DEPENDENCIES:
            return False, f'{dependency} 是系统依赖，不能卸载'
        
        if dependency.lower() in APP_DEPENDENCIES:
            return False, f'{dependency} 是软件运行依赖，不能卸载'
        
        # 检查依赖是否存在，避免卸载不存在的依赖时返回成功
        installed = False
        for dist in distributions():
            pkg_name = dist.metadata['Name'].lower() if 'Name' in dist.metadata else dist.metadata.get('name', '').lower()
            if pkg_name == dependency.lower():
                installed = True
                break
                
        if not installed:
            return False, f'{dependency} 未安装或已被卸载'
        
        utils.print_status(f"正在卸载 {dependency}...", 'start')
        
        # 使用当前活动环境的Python
        python_executable = config.get_active_python_executable()
        
        # 执行卸载命令
        process = subprocess.run(
            [python_executable, '-m', 'pip', 'uninstall', '-y', dependency],
            capture_output=True, 
            text=True
        )
        
        # 检查返回状态
        if process.returncode != 0:
            error_message = process.stderr or "卸载失败，但没有详细错误信息"
            utils.print_status(f"卸载 {dependency} 失败: {error_message}", 'error')
            return False, f'卸载失败: {error_message}'
        
        utils.print_status(f"成功卸载 {dependency}", 'success')
        return True, f'成功卸载: {dependency}'
    except Exception as e:
        utils.print_status(f"卸载 {dependency} 过程中出错: {str(e)}", 'error')
        return False, f'卸载过程中出错: {str(e)}'

# 更新依赖
def update_dependency(dependency, task_id):
    """
    更新依赖到最新版本
    
    Args:
        dependency (str): 依赖名称
        task_id (str): 任务ID
        
    Returns:
        bool: 是否成功
    """
    try:
        utils.update_task_progress(task_id, 10, f'开始更新 {dependency}...')
        
        # 更新依赖
        utils.print_status(f"正在更新 {dependency} 到最新版本...", 'start')
        
        # 使用当前活动环境的Python
        python_executable = config.get_active_python_executable()
        
        # 使用流式处理函数处理命令输出
        cmd = [python_executable, '-m', 'pip', 'install', '--upgrade', dependency]
        success = utils.stream_process_output(cmd, task_id, dependency)
        
        if not success:
            utils.print_status(f"更新 {dependency} 失败", 'error')
            utils.update_task_progress(task_id, 100, f'更新 {dependency} 失败')
            return False
        
        utils.print_status(f"成功更新 {dependency} 到最新版本", 'success')
        utils.update_task_progress(task_id, 100, f'成功更新 {dependency}')
        return True
    except Exception as e:
        utils.print_status(f"更新 {dependency} 时发生错误: {str(e)}", 'error')
        return False

# 切换版本
def switch_version(package, version, task_id):
    """
    切换依赖版本
    
    Args:
        package (str): 包名称
        version (str): 目标版本
        task_id (str): 任务ID
        
    Returns:
        bool: 是否成功
    """
    try:
        utils.update_task_progress(task_id, 10, f'开始将 {package} 切换到版本 {version}...')
        
        # 切换版本
        utils.print_status(f"正在将 {package} 切换到版本 {version}...", 'start')
        
        # 使用当前活动环境的Python
        python_executable = config.get_active_python_executable()
        
        # 使用流式处理函数处理命令输出
        cmd = [python_executable, '-m', 'pip', 'install', f'{package}=={version}', '--force-reinstall']
        success = utils.stream_process_output(cmd, task_id, package)
        
        if not success:
            utils.print_status(f"切换 {package} 到版本 {version} 失败", 'error')
            utils.update_task_progress(task_id, 100, f'切换 {package} 到版本 {version} 失败')
            return False
        
        utils.print_status(f"成功将 {package} 切换到版本 {version}", 'success')
        utils.update_task_progress(task_id, 100, f'成功将 {package} 切换到版本 {version}')
        return True
    except Exception as e:
        utils.print_status(f"切换版本时发生错误: {str(e)}", 'error')
        return False

# 批量卸载
def batch_uninstall(packages, task_id):
    """
    批量卸载多个依赖
    
    Args:
        packages (list): 依赖名称列表
        task_id (str): 任务ID
    
    Returns:
        bool: 是否全部成功
    """
    # 使用通用批量处理功能
    errors = []
    total = len(packages)
    
    for index, pkg in enumerate(packages):
        try:
            # 检查是否是系统依赖或应用依赖
            if pkg.lower() in SYSTEM_DEPENDENCIES or pkg.lower() in APP_DEPENDENCIES:
                errors.append(f"{pkg}: 系统或软件依赖不能卸载")
                continue
            
            # 更新进度
            utils.update_task_progress(
                task_id, 
                index + 1, 
                f'卸载 {pkg} ({index + 1}/{total})'
            )
            
            # 执行卸载
            success, message = uninstall_dependency(pkg)
            if not success:
                errors.append(f"{pkg}: {message}")
            
        except Exception as e:
            errors.append(f"{pkg}: {str(e)}")
    
    # 完成任务
    utils.complete_task(task_id, errors)
    
    # 如果有错误，则返回失败
    return len(errors) == 0

# 批量更新
def batch_update(packages, task_id):
    """
    批量更新多个依赖
    
    Args:
        packages (list): 依赖名称列表
        task_id (str): 任务ID
    
    Returns:
        bool: 是否全部成功
    """
    errors = []
    total = len(packages)
    
    for index, pkg in enumerate(packages):
        try:
            # 更新进度
            utils.update_task_progress(
                task_id, 
                index + 1, 
                f'更新 {pkg} ({index + 1}/{total})'
            )
            
            # 执行更新
            success = update_dependency(pkg, task_id)
            if not success:
                errors.append(f"{pkg}: 更新失败")
            
        except Exception as e:
            errors.append(f"{pkg}: {str(e)}")
    
    # 完成任务
    utils.complete_task(task_id, errors)
    
    # 如果有错误，则返回失败
    return len(errors) == 0

# 安装依赖
def install_dependency(package_name):
    """
    安装单个依赖
    
    Args:
        package_name (str): 包名称
    
    Returns:
        tuple: (success, message) 元组
    """
    try:
        utils.print_status(f"正在安装 {package_name}...", 'start')
        # 使用当前活动环境的Python
        python_executable = config.get_active_python_executable()
        
        # 使用subprocess.run而不是check_call，这样可以捕获输出和返回码
        result = subprocess.run(
            [python_executable, '-m', 'pip', 'install', package_name],
            capture_output=True,
            text=True
        )
        
        # 检查命令执行结果
        if result.returncode == 0:
            utils.print_status(f"成功安装 {package_name}", 'success')
            return True, f'成功安装: {package_name}'
        else:
            # 返回pip命令的错误信息
            error_message = result.stderr.strip() or '未知错误'
            utils.print_status(f"安装 {package_name} 失败: {error_message}", 'error')
            return False, f'安装失败: {error_message}'
            
    except Exception as e:
        utils.print_status(f"处理安装请求时出错: {str(e)}", 'error')
        return False, f'安装失败: {str(e)}'

# 安装wheel文件
def install_whl(file_path, task_id):
    """
    安装wheel文件
    
    Args:
        file_path (str): wheel文件路径
        task_id (str): 任务ID
    
    Returns:
        bool: 是否成功
    """
    file_name = os.path.basename(file_path)
    
    try:
        utils.update_task_progress(task_id, 10, f'准备安装 {file_name}...')
        utils.print_status(f"正在安装wheel文件: {file_name}", 'start')
        
        # 使用当前活动环境的Python
        python_executable = config.get_active_python_executable()
        
        # 使用流式处理输出
        cmd = [python_executable, '-m', 'pip', 'install', file_path]
        success = utils.stream_process_output(cmd, task_id, file_name)
        
        if not success:
            utils.print_status(f"安装 {file_name} 失败", 'error')
            utils.update_task_progress(task_id, 100, f'安装 {file_name} 失败')
            return False
        
        utils.print_status(f"成功安装 {file_name}", 'success')
        utils.update_task_progress(task_id, 100, f'成功安装 {file_name}')
        return True
    except Exception as e:
        utils.print_status(f"安装 {file_name} 时发生错误: {str(e)}", 'error')
        return False

# 安装requirements文件
def install_requirements(file_path, task_id):
    """
    安装requirements.txt文件
    
    Args:
        file_path (str): requirements文件路径
        task_id (str): 任务ID
    
    Returns:
        bool: 是否成功
    """
    file_name = os.path.basename(file_path)
    
    try:
        utils.update_task_progress(task_id, 0, '正在读取requirements.txt文件...')
        utils.print_status(f"正在读取文件 {file_name}...", 'start')
        
        # 读取requirements文件
        with open(file_path, 'r') as f:
            requirements = [line.strip() for line in f.readlines() if line.strip() and not line.strip().startswith('#')]
        
        if not requirements:
            utils.update_task_progress(task_id, 100, '没有找到有效的包，文件可能为空')
            utils.print_status(f"文件 {file_name} 为空或只包含注释", 'warning')
            utils.complete_task(task_id, [{"package": file_name, "error": "文件为空或只包含注释"}])
            return False
            
        utils.update_task_progress(task_id, 10, f'找到 {len(requirements)} 个包需要安装')
        utils.print_status(f"找到 {len(requirements)} 个依赖需要安装", 'info')
        
        # 使用当前活动环境的Python
        python_executable = config.get_active_python_executable()
        
        # 使用pip直接安装requirements.txt文件，使用流式处理
        cmd = [python_executable, '-m', 'pip', 'install', '-r', file_path]
        success = utils.stream_process_output(cmd, task_id, "requirements.txt")
        
        if not success:
            utils.print_status(f"安装requirements.txt失败", 'error')
            return False
        
        utils.print_status("成功安装requirements.txt中的依赖", 'success')
        return True
    except Exception as e:
        utils.print_status(f"处理文件 {file_name} 时出错: {str(e)}", 'error')
        return False

# 清理PIP缓存
def clean_pip_cache(task_id):
    """
    清理PIP缓存
    
    Args:
        task_id (str): 任务ID
    
    Returns:
        bool: 是否成功
    """
    try:
        utils.update_task_progress(task_id, 10, '开始清理PIP缓存...')
        utils.print_status("开始清理PIP缓存...", 'start')
        
        # 使用当前活动环境的Python
        python_executable = config.get_active_python_executable()
        
        # 执行pip cache purge命令清理缓存
        utils.update_task_progress(task_id, 50, '正在清理PIP缓存...')
        result = subprocess.run(
            [python_executable, '-m', 'pip', 'cache', 'purge'],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            utils.print_status(f"清理PIP缓存失败: {result.stderr}", 'error')
            utils.update_task_progress(task_id, 100, '清理缓存失败')
            utils.complete_task(task_id, [f"清理缓存失败: {result.stderr}"])
            return False
        
        utils.print_status("PIP缓存清理完成", 'success')
        utils.update_task_progress(task_id, 100, '缓存清理完成')
        utils.complete_task(task_id, [])
        return True
    except Exception as e:
        utils.print_status(f"清理缓存出错: {str(e)}", 'error')
        utils.complete_task(task_id, [f"清理缓存出错: {str(e)}"])
        return False

# 全局变量用于检测循环依赖
_visited_packages = set()

def get_dependency_graph(package_name, max_depth=2, include_dev=False):
    """
    获取依赖关系图数据
    
    Args:
        package_name (str): 包名称
        max_depth (int): 最大依赖深度
        include_dev (bool): 是否包括开发依赖
        
    Returns:
        dict: 包含nodes和links的图形数据
    """
    # 重置访问记录
    global _visited_packages
    _visited_packages = set()
    
    # 初始化图形数据结构
    graph_data = {
        "nodes": [],
        "links": []
    }
    
    try:
        # 检查包是否已安装
        if not is_package_installed(package_name):
            return {
                "nodes": [{
                    "id": package_name,
                    "name": package_name,
                    "version": "未安装",
                    "type": "main",
                    "description": "包未安装"
                }],
                "links": []
            }
        
        # 获取主包信息
        main_package_info = get_package_info(package_name)
        if not main_package_info:
            return {
                "nodes": [{
                    "id": package_name,
                    "name": package_name,
                    "version": "未知",
                    "type": "main",
                    "description": "无法获取包信息"
                }],
                "links": []
            }
        
        # 添加主包节点
        graph_data["nodes"].append({
            "id": package_name,
            "name": package_name,
            "version": main_package_info.get("version", "未知"),
            "type": "main",
            "description": main_package_info.get("summary", "无描述")
        })
        
        # 标记主包为已访问
        _visited_packages.add(package_name)
        
        # 递归构建依赖树
        build_dependency_tree(
            package_name, 
            graph_data, 
            current_depth=0, 
            max_depth=max_depth,
            include_dev=include_dev
        )
        
        return graph_data
        
    except Exception as e:
        print(f"获取依赖关系图失败: {str(e)}")
        # 返回包含错误信息的最小图
        return {
            "nodes": [{
                "id": package_name,
                "name": package_name,
                "version": "错误",
                "type": "main",
                "description": f"获取依赖关系图失败: {str(e)}"
            }],
            "links": []
        }

def build_dependency_tree(package_name, graph_data, current_depth=0, max_depth=2, include_dev=False):
    """
    递归构建依赖树
    
    Args:
        package_name (str): 包名称
        graph_data (dict): 图形数据
        current_depth (int): 当前深度
        max_depth (int): 最大深度
        include_dev (bool): 是否包括开发依赖
    """
    # 防止超出最大深度
    if current_depth >= max_depth:
        return
    
    # 获取包的依赖信息
    dependencies = get_package_dependencies(package_name)
    
    # 处理依赖
    for dep_name, dep_info in dependencies.items():
        # 跳过已处理的依赖，避免循环
        if dep_name in _visited_packages:
            continue
        
        # 检查是否需要包含开发依赖
        if not include_dev and dep_info.get("dev_dependency", False):
            continue
            
        # 标记为已访问
        _visited_packages.add(dep_name)
        
        # 获取详细的包信息
        package_info = get_package_info(dep_name)
        
        # 确定节点类型
        node_type = "direct"
        if dep_info.get("optional", False):
            node_type = "optional"
            
        # 添加节点
        graph_data["nodes"].append({
            "id": dep_name,
            "name": dep_name,
            "version": package_info.get("version", "未知") if package_info else "未知",
            "type": node_type,
            "description": package_info.get("summary", "无描述") if package_info else "无描述"
        })
        
        # 添加链接
        graph_data["links"].append({
            "source": package_name,
            "target": dep_name,
            "type": "optional" if dep_info.get("optional", False) else "required"
        })
        
        # 递归处理子依赖
        build_dependency_tree(
            dep_name,
            graph_data,
            current_depth + 1,
            max_depth,
            include_dev
        )

def get_package_dependencies(package_name):
    """
    获取包的依赖信息
    
    Args:
        package_name (str): 包名称
        
    Returns:
        dict: 依赖信息字典
    """
    dependencies = {}
    
    try:
        # 使用pip show命令获取包信息
        result = subprocess.run(
            [sys.executable, "-m", "pip", "show", package_name],
            capture_output=True,
            text=True,
            check=False  # 不抛出异常，以便处理错误
        )
        
        if result.returncode != 0:
            print(f"无法获取包 {package_name} 的信息: {result.stderr}")
            return {}
        
        # 解析输出
        output = result.stdout
        
        # 提取依赖信息
        requires_section = re.search(r"Requires: (.+)", output)
        if requires_section:
            requires_str = requires_section.group(1).strip()
            if requires_str and requires_str != "none":
                for dep in requires_str.split(', '):
                    dep = dep.strip()
                    if dep:
                        # 检查是否为可选依赖（有额外标记）
                        optional = "[" in dep or ";" in dep
                        
                        # 提取基本包名
                        base_name = dep.split('[')[0].split(';')[0].split('=')[0].split('>')[0].split('<')[0].strip()
                        
                        dependencies[base_name] = {
                            "optional": optional,
                            "dev_dependency": False,  # pip show不区分开发依赖
                            "raw_requirement": dep
                        }
        
        # 尝试从setup.py或pyproject.toml获取更详细的依赖信息
        # 注意：这需要实际访问包的源代码或安装目录
        # 此处省略实现，实际应用中可能需要更复杂的逻辑
                
        return dependencies
        
    except Exception as e:
        print(f"获取包 {package_name} 的依赖信息失败: {str(e)}")
        return {}

def get_package_info(package_name):
    """
    获取包的详细信息
    
    Args:
        package_name (str): 包名称
        
    Returns:
        dict: 包信息字典
    """
    try:
        # 使用pip show命令获取包信息
        result = subprocess.run(
            [sys.executable, "-m", "pip", "show", package_name],
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode != 0:
            print(f"无法获取包 {package_name} 的信息: {result.stderr}")
            return None
        
        # 解析输出
        output = result.stdout
        info = {}
        
        # 提取基本信息
        name_match = re.search(r"Name: (.+)", output)
        version_match = re.search(r"Version: (.+)", output)
        summary_match = re.search(r"Summary: (.+)", output)
        
        if name_match:
            info["name"] = name_match.group(1).strip()
        if version_match:
            info["version"] = version_match.group(1).strip()
        if summary_match:
            info["summary"] = summary_match.group(1).strip()
        
        return info
        
    except Exception as e:
        print(f"获取包 {package_name} 的信息失败: {str(e)}")
        return None

def is_package_installed(package_name):
    """
    检查包是否已安装
    
    Args:
        package_name (str): 包名称
        
    Returns:
        bool: 是否已安装
    """
    try:
        # 使用pip list命令检查包是否已安装
        result = subprocess.run(
            [sys.executable, "-m", "pip", "list"],
            capture_output=True,
            text=True,
            check=True
        )
        
        # 解析输出，查找包名
        pattern = r"(?:^|\n)" + re.escape(package_name) + r"\s+"
        return bool(re.search(pattern, result.stdout, re.IGNORECASE))
        
    except Exception as e:
        print(f"检查包 {package_name} 是否已安装失败: {str(e)}")
        return False

# 获取单个依赖的详细信息
def get_single_dependency_info(package_name, force_refresh=False):
    """
    获取单个依赖的详细信息，支持增量刷新
    
    当执行单个包的操作（安装、卸载、更新）后，可以使用此函数仅刷新该包的信息，
    而不是重新获取所有依赖的列表。
    
    Args:
        package_name (str): 包名
        force_refresh (bool): 是否强制刷新PyPI版本缓存
        
    Returns:
        dict: 依赖信息字典，如果包不存在则返回None
    """
    # 获取当前激活的Python环境路径
    python_executable = config.get_active_python_executable()
    
    # 检查包是否已安装
    try:
        # 创建一个临时脚本，用于获取包信息
        script = """
import sys
import json
try:
    if sys.version_info < (3,8):
        from importlib_metadata import distributions
    else:
        from importlib.metadata import distributions
    
    package_name = sys.argv[1].lower()
    package_info = None
    
    for dist in distributions():
        try:
            pkg_name = dist.metadata['Name'].lower() if 'Name' in dist.metadata else dist.metadata.get('name', '').lower()
            if pkg_name == package_name:
                package_info = {
                    'name': pkg_name,
                    'version': dist.version
                }
                break
        except Exception as e:
            print(f"Error processing {dist}: {e}", file=sys.stderr)
    
    print(json.dumps(package_info))
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
"""
        # 创建临时文件
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as temp_file:
            temp_path = temp_file.name
            temp_file.write(script)
        
        try:
            # 执行脚本获取包信息
            result = subprocess.run(
                [python_executable, temp_path, package_name],
                capture_output=True, 
                text=True
            )
            
            if result.returncode != 0:
                utils.print_status(f"获取依赖 {package_name} 信息失败: {result.stderr}", 'error')
                return None
            
            # 解析脚本输出
            package_data = json.loads(result.stdout.strip())
            if not package_data:
                # 包未安装
                return None
            
            # 设置包的其他属性
            pkg_name = package_data['name']
            pkg_version = package_data['version']
            
            is_system = pkg_name in SYSTEM_DEPENDENCIES
            is_core = pkg_name in CORE_DEPENDENCIES
            is_ai_model = pkg_name in AI_MODEL_DEPENDENCIES
            is_app_required = pkg_name in APP_DEPENDENCIES
            
            # 获取包描述
            description = dependency_descriptions.get(pkg_name, "")
            if not description:
                # 如果没有描述，尝试从PyPI获取
                try:
                    response = requests.get(f"https://pypi.org/pypi/{pkg_name}/json", timeout=5)
                    if response.status_code == 200:
                        data = response.json()
                        description = data.get('info', {}).get('summary', "")
                        dependency_descriptions[pkg_name] = description
                        save_descriptions()
                except Exception as e:
                    utils.print_status(f"获取 {pkg_name} 描述失败: {e}", 'warning')
            
            # 获取最新版本信息，可选强制刷新
            latest_version = ""
            is_latest = False
            
            try:
                if not is_system and not is_app_required:
                    pypi_info = get_latest_version_from_pypi(pkg_name, force_refresh)
                    if pypi_info.get('version'):
                        latest_version = pypi_info['version']
                        
                        # 版本比较
                        norm_current = normalize_version(pkg_version)
                        norm_latest = normalize_version(latest_version)
                        is_latest = (norm_current == norm_latest)
                        
                        if not is_latest:
                            try:
                                current_ver = version.parse(pkg_version)
                                latest_ver = version.parse(latest_version)
                                is_latest = (current_ver >= latest_ver)
                            except Exception:
                                is_latest = (pkg_version == latest_version)
            except Exception as e:
                utils.print_status(f"获取 {pkg_name} 的最新版本信息失败: {e}", 'warning')
                is_latest = False
            
            # 返回完整的依赖信息
            return {
                'name': pkg_name,
                'version': pkg_version,
                'description': description,
                'isSystem': is_system,
                'isCore': is_core, 
                'isAIModel': is_ai_model,
                'isAppRequired': is_app_required,
                'isLatest': is_latest,
                'latestVersion': latest_version
            }
                
        finally:
            # 清理临时文件
            try:
                os.unlink(temp_path)
            except:
                pass
    except Exception as e:
        utils.print_status(f"获取依赖 {package_name} 信息失败: {e}", 'error')
        return None
    
    return None

# 加载缓存的描述信息
load_descriptions()
