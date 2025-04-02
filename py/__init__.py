"""
AI环境管理工具 - Python后端模块包

这个包包含所有与后端功能相关的Python模块，采用模块化设计以提高代码的可维护性。
"""

# 导出主要模块，使它们可以直接从包中导入
from . import config
from . import dependency
from . import api
from . import utils

# 版本信息
__version__ = '1.0.0'
