// 主入口文件 - 导入模块并初始化应用

// 导入必要的模块
import { loadDependencies, checkDescriptionUpdates, checkLatestVersions, refreshDependencies } from './modules/core-api.js';
import { showNotification, showLoadingMessage, 
         showInitialLoadingScreen, hideInitialLoadingScreen,
         updateInitialLoadingProgress } from './modules/ui-components.js';
import { dependencyHandler, environmentManager } from './modules/dependency-manager.js';

// 记录最后一次描述更新检查时间
let lastDescriptionUpdateCheck = 0;
// 描述更新检查间隔 (毫秒)
const DESCRIPTION_CHECK_INTERVAL = 30000;

// 添加软件启动状态标志
let appInitialized = false;

/**
 * 启动描述更新检查器
 */
function startDescriptionUpdateChecker() {
    // 每30秒检查一次是否有描述更新
    setInterval(async () => {
        // 只有应用初始化完成后才执行
        if (appInitialized) {
            const result = await checkDescriptionUpdates(lastDescriptionUpdateCheck / 1000);
            if (result.hasUpdates) {
                console.log('发现依赖描述更新，正在刷新...');
                await refreshDependencies(true); // 使用缓存刷新，不重复检查版本
            }
            lastDescriptionUpdateCheck = Date.now();
        }
    }, DESCRIPTION_CHECK_INTERVAL);
}

/**
 * 加载系统信息
 */
async function loadSystemInfo() {
    try {
        updateInitialLoadingProgress(70, '加载系统信息...');
        console.log('正在加载系统信息...');
        const response = await fetch('/api/system-info');
        
        if (!response.ok) {
            throw new Error(`请求失败: ${response.status}`);
        }
        
        const data = await response.json();
        
        // 使用更简洁的方式更新DOM元素
        const elements = {
            'python-version': `Python: ${data.pythonVersion}`,
            'pip-version': `Pip: ${data.pipVersion}`
        };
        
        // 批量更新元素内容
        Object.entries(elements).forEach(([id, text]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = text;
        });
        
        updateInitialLoadingProgress(80, '系统信息加载完成');
    } catch (error) {
        console.error('加载系统信息失败:', error);
        // 同样使用简洁方式更新错误状态
        ['python-version', 'pip-version'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = id.includes('python') 
                ? 'Python: 加载失败' : 'Pip: 加载失败';
        });
        updateInitialLoadingProgress(80, '系统信息加载失败，继续初始化...');
    }
}

/**
 * 设置所有事件监听器
 */
function setupEventListeners() {
    // 更新进度
    updateInitialLoadingProgress(85, '设置事件监听...');
    
    // 设置依赖管理相关事件
    dependencyHandler.setupDependencyEvents();
    
    // 设置环境管理相关事件
    environmentManager.setupEnvironmentEvents();
    
    updateInitialLoadingProgress(90, '事件初始化完成');
}

/**
 * 初始化应用所有功能模块
 */
async function initializeAppFeatures() {
    updateInitialLoadingProgress(95, '初始化应用功能...');
    
    // 记录当前时间作为初始检查点
    lastDescriptionUpdateCheck = Date.now();
    
    // 先初始化环境管理器，确保环境信息已加载
    await environmentManager.initialize();
    
    // 启动描述更新检查器（仅设置定时器，不立即执行）
    startDescriptionUpdateChecker();
    
    console.log('所有应用功能已初始化');
    updateInitialLoadingProgress(100, '初始化完成！');
      // 短暂延迟后隐藏加载界面，让用户看到100%的完成状态
    setTimeout(async () => {
        hideInitialLoadingScreen();
        appInitialized = true;
        
        // 应用完全初始化后，触发一次性的依赖描述更新
        console.log('应用已完全初始化，开始检查缺失的依赖描述...');
        const result = await checkDescriptionUpdates(lastDescriptionUpdateCheck / 1000, true); // 使用isFirstLoad=true标记首次加载
        if (result.hasUpdates) {
            console.log('发现缺失的依赖描述，正在刷新...');
            await refreshDependencies(true); // 使用缓存刷新，不重复检查版本
        }
        lastDescriptionUpdateCheck = Date.now();
    }, 500);
}

/**
 * 模拟加载进度 - 优化版
 * 更平滑地模拟进度，支持非线性进度增长
 * @param {Function} updateCallback - 进度更新回调
 * @param {number} startPercent - 起始百分比
 * @param {number} endPercent - 结束百分比
 * @param {number} duration - 总持续时间(毫秒)
 * @param {string} message - 进度消息
 * @param {string} curve - 进度曲线类型 ('linear', 'ease-out')
 */
function simulateProgress(updateCallback, startPercent, endPercent, duration, message, curve = 'linear') {
    const stepCount = 20; // 增加步数，使进度更平滑
    const stepTime = duration / stepCount;
    
    updateCallback(startPercent, message);
    
    let currentStep = 0;
    const interval = setInterval(() => {
        currentStep++;
        if (currentStep <= stepCount) {
            let progress;
            const ratio = currentStep / stepCount;
            
            // 根据不同曲线类型计算进度
            if (curve === 'ease-out') {
                // 缓出效果：开始快，结束慢
                progress = startPercent + (endPercent - startPercent) * (1 - Math.pow(1 - ratio, 2));
            } else if (curve === 'ease-in') {
                // 缓入效果：开始慢，结束快
                progress = startPercent + (endPercent - startPercent) * (ratio * ratio);
            } else {
                // 线性
                progress = startPercent + (endPercent - startPercent) * ratio;
            }
            
            updateCallback(Math.round(progress), message);
        } else {
            clearInterval(interval);
        }
    }, stepTime);
    
    return {
        clear: () => clearInterval(interval),
        complete: () => {
            clearInterval(interval);
            updateCallback(endPercent, message);
        }
    };
}

// 应用初始化函数
async function initApp() {
    try {
        console.log('正在初始化应用...');
        
        // 显示初始加载屏幕
        showInitialLoadingScreen(async () => {
            // 阶段1: 初始连接 (0-20%)
            const initialProgress = simulateProgress(
                updateInitialLoadingProgress,
                0, 20,
                800, 
                '正在连接服务...',
                'ease-out'
            );
            
            // 等待服务连接
            setTimeout(async () => {
                initialProgress.complete();
                
                // 阶段2: 准备加载依赖数据 (20-30%)
                updateInitialLoadingProgress(20, '正在准备加载依赖数据...');
                
                try {
                    // 阶段3: 获取依赖列表 (30-50%)
                    const dependencyListProgress = simulateProgress(
                        updateInitialLoadingProgress,
                        30, 50,
                        1000,
                        '正在获取依赖列表...'
                    );
                    
                    // 刷新依赖列表时的回调函数，用于更新进度
                    const progressCallback = (stage, detail) => {
                        if (stage === 'start') {
                            dependencyListProgress.complete();
                        } else if (stage === 'loading') {
                            updateInitialLoadingProgress(55, '正在加载依赖信息...');
                        } else if (stage === 'processing') {
                            updateInitialLoadingProgress(70, '正在处理依赖数据...');
                        }
                    };
                    
                    // 刷新依赖列表，传入进度回调
                    await refreshDependencies(false, progressCallback);
                    
                    // 阶段4: 加载系统信息 (70-80%)
                    updateInitialLoadingProgress(70, '正在加载系统信息...');
                    await loadSystemInfo();
                    
                    // 阶段5: 设置事件监听和初始化组件 (80-95%)
                    const finalSetupProgress = simulateProgress(
                        updateInitialLoadingProgress,
                        80, 95,
                        300,
                        '正在初始化界面组件...'
                    );
                    
                    // 设置事件监听器
                    setupEventListeners();
                    finalSetupProgress.complete();
                    
                    // 阶段6: 最终初始化 (95-100%)
                    // 初始化应用功能
                    initializeAppFeatures();
                    
                } catch (error) {
                    console.error('依赖数据加载失败:', error);
                    updateInitialLoadingProgress(100, '加载失败，请刷新页面重试');
                    showNotification('应用初始化失败，请刷新页面重试', 'error');
                    hideInitialLoadingScreen();
                }
            }, 800);
        });
        
    } catch (error) {
        console.error('应用初始化失败:', error);
        showLoadingMessage(`加载失败: ${error.message}`);
        hideInitialLoadingScreen();
    }
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', initApp);

// 添加全局错误处理
window.addEventListener('error', function(event) {
    console.error('全局错误:', event.error);
    showNotification(`发生错误: ${event.error.message}`, 'error');
});

// 导出refreshDependencies供其他模块使用
export { refreshDependencies };
