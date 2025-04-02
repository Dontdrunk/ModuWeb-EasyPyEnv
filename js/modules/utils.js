// 实用工具函数模块

/**
 * 防抖函数
 * @param {Function} func - 要执行的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} 防抖处理后的函数
 */
export function debounce(func, wait) {
    let timeout;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

/**
 * 检查输入元素是否为空
 * @param {HTMLInputElement} inputElement - 输入元素
 * @returns {boolean} 是否为空
 */
export function isInputEmpty(inputElement) {
    if (!inputElement) return true;
    return inputElement.value === null || inputElement.value === undefined || inputElement.value.trim() === '';
}

