"""
配置模块 - 处理应用程序配置、设置和缓存

此模块负责处理与应用程序配置相关的所有功能，包括：
- 加载和保存用户设置
- 管理依赖配置
- 处理缓存文件
"""

import os
import json
import sys

# 配置目录路径
CONFIG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'config')

# 依赖描述缓存文件路径
CACHE_FILE = os.path.join(CONFIG_DIR, 'dependency_cache.json')
# 依赖配置文件路径
DEPENDENCIES_CONFIG_FILE = os.path.join(CONFIG_DIR, 'dependencies_config.json')
# 用户设置文件路径
USER_SETTINGS_FILE = os.path.join(CONFIG_DIR, 'user_settings.json')
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

# 加载用户设置
def load_user_settings():
    """
    加载用户设置文件
    
    Returns:
        dict: 用户设置字典
    """
    default_settings = {}
    
    if os.path.exists(USER_SETTINGS_FILE):
        try:
            with open(USER_SETTINGS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"加载用户设置文件失败: {e}")
    
    # 如果设置文件不存在或加载失败，创建默认设置文件
    save_user_settings(default_settings)
    return default_settings

# 保存用户设置
def save_user_settings(settings):
    """
    保存用户设置到文件
    
    Args:
        settings (dict): 要保存的设置
        
    Returns:
        bool: 是否保存成功
    """
    try:
        with open(USER_SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"保存用户设置失败: {e}")
        return False

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
    import time
    
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

# 加载所有配置
dependency_config = load_dependencies_config()
SYSTEM_DEPENDENCIES = dependency_config.get('systemDependencies', [])
CORE_DEPENDENCIES = dependency_config.get('dataScienceDependencies', [])
AI_MODEL_DEPENDENCIES = dependency_config.get('aiDependencies', [])
APP_DEPENDENCIES = dependency_config.get('softwareDependencies', [])
