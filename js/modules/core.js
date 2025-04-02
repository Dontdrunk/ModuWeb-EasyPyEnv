// 核心功能模块 - 包含应用的共享核心功能

import { loadDependencies } from './api.js';
import { renderDependencyList, showNotification, showLoadingMessage, updateInitialLoadingProgress } from './ui.js';

/**
 * 刷新依赖列表 - 核心功能
 * @param {boolean} useCache - 是否使用缓存而不检查更新
 * @param {Function} progressCallback - 进度回调函数
 * @returns {Promise<Array>} 依赖列表
 */
export async function refreshDependencies(useCache = false, progressCallback = null) {
    try {
        console.log('刷新依赖列表...');
        
        // 调用进度回调
        if (progressCallback) {
            progressCallback('start');
        }
        
        // 尝试更新加载进度（如果在初始加载过程中）
        try {
            updateInitialLoadingProgress(40, '正在获取依赖列表...');
        } catch (e) {
            // 忽略错误，可能不是在初始加载阶段
        }
        
        // 在加载新数据前先显示加载状态
        showLoadingMessage('刷新依赖列表...');
        
        // 调用进度回调 - 加载阶段
        if (progressCallback) {
            progressCallback('loading');
        }
        
        // 确保使用最新数据获取依赖
        const dependencies = await loadDependencies(useCache);
        
        // 更新进度
        try {
            updateInitialLoadingProgress(60, '依赖列表加载完成');
        } catch (e) {
            // 忽略错误
        }
        
        // 调用进度回调 - 处理阶段
        if (progressCallback) {
            progressCallback('processing');
        }
        
        // 强制清空UI并完全重新渲染
        renderDependencyList(dependencies);
        
        console.log(`依赖列表已刷新，共 ${dependencies.length} 个依赖`);
        
        // 最终进度更新
        try {
            updateInitialLoadingProgress(75, '依赖列表渲染完成');
        } catch (e) {
            // 忽略错误
        }
        
        // 调用进度回调 - 完成阶段
        if (progressCallback) {
            progressCallback('complete', dependencies.length);
        }
        
        return dependencies;
    } catch (error) {
        console.error('刷新依赖列表失败:', error);
        showNotification('刷新依赖列表失败，请检查网络连接', 'error');
        
        // 调用进度回调 - 错误
        if (progressCallback) {
            progressCallback('error', error);
        }
        
        return [];
    }
}
