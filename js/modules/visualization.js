/**
 * 依赖关系图可视化模块 - 用于可视化包依赖关系
 */

import { showNotification } from './ui-components.js';

// D3.js库CDN URL - 生产环境应考虑本地部署
const D3_URL = 'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js';

// 存储D3库的引用
let d3 = null;

/**
 * 加载D3.js库
 * @returns {Promise<Object>} D3库对象
 */
async function loadD3() {
    if (d3) return d3; // 如果已加载则直接返回

    return new Promise((resolve, reject) => {
        // 检查是否已存在
        if (window.d3) {
            d3 = window.d3;
            return resolve(d3);
        }

        // 创建script标签动态加载
        const script = document.createElement('script');
        script.src = D3_URL;
        script.async = true;
        
        script.onload = () => {
            d3 = window.d3;
            console.log('D3.js库加载成功');
            resolve(d3);
        };
        
        script.onerror = () => {
            reject(new Error('加载D3.js库失败'));
        };
        
        document.head.appendChild(script);
    });
}

/**
 * 依赖关系图处理类
 */
class DependencyGraph {
    constructor() {
        this.modal = document.getElementById('dependency-graph-modal');
        this.packageNameElem = document.getElementById('graph-package-name');
        this.container = document.getElementById('dependency-graph');
        this.loadingElem = document.getElementById('graph-loading');
        this.errorElem = document.getElementById('graph-error');
        
        this.initialized = false;
        this.simulation = null;
        this.tooltip = null;
        
        // 初始化事件处理
        this.initEvents();
    }
    
    /**
     * 初始化事件处理
     * @private
     */
    initEvents() {
        // 当模态框关闭时停止模拟
        const closeBtn = this.modal.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hide();
            });
        }
        
        // 点击模态框背景关闭
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        });
        
        // 监听窗口大小变化，调整图表大小
        window.addEventListener('resize', () => {
            if (this.simulation && this.modal.style.display === 'flex') {
                this.resizeGraph();
            }
        });
    }
    
    /**
     * 显示依赖关系图
     * @param {string} packageName - 包名
     */
    async show(packageName) {
        if (!packageName) return;
        
        // 设置包名和显示模态框
        this.packageNameElem.textContent = packageName;
        this.modal.style.display = 'flex';
        
        // 显示加载状态，隐藏错误
        this.showLoading(true);
        this.showError(false);
        
        try {
            // 确保D3.js已加载
            await loadD3();
            
            // 获取依赖数据
            const dependencyData = await this.fetchDependencyData(packageName);
            
            // 渲染图表
            this.renderGraph(dependencyData);
            
        } catch (error) {
            console.error('显示依赖关系图失败:', error);
            this.showError(true, error.message);
            showNotification(`加载依赖关系图失败: ${error.message}`, 'error');
        }
    }
    
    /**
     * 隐藏依赖关系图
     */
    hide() {
        this.modal.style.display = 'none';
        
        // 停止模拟，释放资源
        if (this.simulation) {
            this.simulation.stop();
        }
    }
    
    /**
     * 设置加载状态显示
     * @param {boolean} isLoading - 是否显示加载状态
     * @private
     */
    showLoading(isLoading) {
        this.loadingElem.style.display = isLoading ? 'block' : 'none';
        
        if (isLoading) {
            // 清空图表容器
            if (this.container) {
                this.container.innerHTML = '';
            }
        }
    }
    
    /**
     * 设置错误状态显示
     * @param {boolean} hasError - 是否显示错误
     * @param {string} errorMsg - 错误消息
     * @private
     */
    showError(hasError, errorMsg = '加载失败') {
        this.errorElem.style.display = hasError ? 'block' : 'none';
        this.errorElem.textContent = errorMsg;
    }
    
    /**
     * 获取依赖数据
     * @param {string} packageName - 包名
     * @returns {Promise<Object>} 依赖数据对象
     * @private
     */
    async fetchDependencyData(packageName) {
        try {
            // 调用真实的API端点获取依赖关系数据
            // 设置最大深度为2，避免数据过大影响性能
            const response = await fetch(`/api/dependency-graph/${packageName}?depth=2`);
            
            if (!response.ok) {
                // 尝试解析错误消息
                let errorMessage = `HTTP错误 ${response.status}`;
                try {
                    const errorData = await response.json();
                    if (errorData.message) {
                        errorMessage = errorData.message;
                    }
                } catch (e) {
                    console.error('解析错误响应失败:', e);
                }
                throw new Error(errorMessage);
            }
            
            // 解析API响应数据
            const responseData = await response.json();
            
            // 检查返回的数据是否包含必要的节点和链接信息
            if (!responseData.success || !responseData.nodes || !responseData.links) {
                throw new Error('API返回的数据格式不正确');
            }
            
            return {
                nodes: responseData.nodes,
                links: responseData.links
            };
        } catch (error) {
            console.error('获取依赖关系数据失败:', error);
            
            // 在发生错误时返回简化的数据结构，仅包含主包节点
            // 这样图表仍然可以渲染，并通过错误提示告知用户问题
            return {
                nodes: [{
                    id: packageName,
                    name: packageName,
                    version: '未知',
                    type: 'main',
                    description: `无法加载依赖数据: ${error.message}`
                }],
                links: []
            };
        }
    }
    
    /**
     * 渲染依赖关系图
     * @param {Object} data - 依赖关系数据
     * @private
     */
    renderGraph(data) {
        if (!data || !data.nodes || !data.links || !this.container) {
            this.showError(true, '无效的依赖关系数据');
            return;
        }
        
        // 隐藏加载和错误提示
        this.showLoading(false);
        this.showError(false);
        
        // 清空容器
        this.container.innerHTML = '';
        
        // 获取容器尺寸
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        // 创建SVG元素
        const svg = d3.select(this.container)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', [0, 0, width, height]);
            
        // 创建缩放行为
        const zoom = d3.zoom()
            .scaleExtent([0.1, 3])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });
        
        svg.call(zoom);
        
        // 创建主绘图组
        const g = svg.append('g');
        
        // 创建连线
        const link = g.append('g')
            .selectAll('.link')
            .data(data.links)
            .enter()
            .append('path')
            .attr('class', d => `link ${d.type}`)
            .attr('marker-end', 'url(#arrowhead)');
        
        // 创建节点
        const node = g.append('g')
            .selectAll('.node')
            .data(data.nodes)
            .enter()
            .append('g')
            .attr('class', 'node')
            .call(this.createDrag(this));
        
        // 节点圆圈
        node.append('circle')
            .attr('r', d => d.type === 'main' ? 12 : 8)
            .style('fill', d => this.getNodeColor(d.type))
            .style('stroke', d => d.type === 'main' ? '#c0392b' : '#2c3e50');
        
        // 节点文本标签
        node.append('text')
            .attr('dy', d => d.type === 'main' ? -15 : -10)
            .attr('text-anchor', 'middle')
            .text(d => d.name)
            .style('font-weight', d => d.type === 'main' ? 'bold' : 'normal');
        
        // 创建力模拟
        this.simulation = d3.forceSimulation(data.nodes)
            .force('link', d3.forceLink(data.links).id(d => d.id).distance(100))
            .force('charge', d3.forceManyBody().strength(-200))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .on('tick', () => {
                // 更新连线位置
                link.attr('d', this.getLinkPath);
                
                // 更新节点位置
                node.attr('transform', d => `translate(${d.x}, ${d.y})`);
            });
        
        // 创建节点拖拽行为
        node.call(d3.drag()
            .on('start', this.dragStarted.bind(this))
            .on('drag', this.dragged.bind(this))
            .on('end', this.dragEnded.bind(this))
        );
        
        // 添加交互 - 鼠标悬停显示详情
        this.addNodeTooltip(node);
        
        // 自动初始适应宽度
        const initialScale = 0.8;
        svg.call(
            zoom.transform, 
            d3.zoomIdentity
                .translate(width / 2, height / 2)
                .scale(initialScale)
                .translate(-width / 2, -height / 2)
        );
    }
    
    /**
     * 创建拖拽行为
     * @param {DependencyGraph} graphObj - 图表对象实例
     * @returns {Function} 拖拽行为函数
     * @private
     */
    createDrag(graphObj) {
        return d3.drag()
            .on('start', function(event, d) {
                if (!event.active) graphObj.simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', function(event, d) {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', function(event, d) {
                if (!event.active) graphObj.simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            });
    }
    
    /**
     * 拖拽开始时的处理
     * @param {Object} event - 事件对象
     * @param {Object} d - 数据对象
     * @private
     */
    dragStarted(event, d) {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }
    
    /**
     * 拖拽进行中的处理
     * @param {Object} event - 事件对象
     * @param {Object} d - 数据对象
     * @private
     */
    dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }
    
    /**
     * 拖拽结束时的处理
     * @param {Object} event - 事件对象
     * @param {Object} d - 数据对象
     * @private
     */
    dragEnded(event, d) {
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }
    
    /**
     * 获取连线路径
     * @param {Object} d - 连线数据
     * @returns {string} SVG路径字符串
     * @private
     */
    getLinkPath(d) {
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dr = Math.sqrt(dx * dx + dy * dy);
        
        // 计算起点和终点位置，考虑节点圆圈半径
        const sourceRadius = d.source.type === 'main' ? 12 : 8;
        const targetRadius = d.target.type === 'main' ? 12 : 8;
        
        const offsetRatio = (dr === 0) ? 0 : 1 / dr;
        
        // 计算调整后的起点和终点
        const ux = dx * offsetRatio;
        const uy = dy * offsetRatio;
        
        const sourceX = d.source.x + ux * sourceRadius;
        const sourceY = d.source.y + uy * sourceRadius;
        const targetX = d.target.x - ux * targetRadius;
        const targetY = d.target.y - uy * targetRadius;
        
        return `M${sourceX},${sourceY}L${targetX},${targetY}`;
    }
    
    /**
     * 获取节点颜色
     * @param {string} type - 节点类型
     * @returns {string} 颜色值
     * @private
     */
    getNodeColor(type) {
        switch(type) {
            case 'main': return '#e74c3c'; // 红色
            case 'direct': return '#3498db'; // 蓝色
            case 'optional': return '#95a5a6'; // 灰色
            default: return '#2ecc71'; // 绿色
        }
    }
    
    /**
     * 添加节点悬停提示框
     * @param {d3.Selection} nodes - 节点选择集
     * @private
     */
    addNodeTooltip(nodes) {
        // 创建提示框元素
        if (!this.tooltip) {
            this.tooltip = d3.select('body')
                .append('div')
                .attr('class', 'node-tooltip')
                .style('opacity', 0);
        }
        
        // 鼠标悬停显示提示框
        nodes.on('mouseover', (event, d) => {
            this.tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
                
            this.tooltip.html(`
                <h4>${d.name}</h4>
                <p class="version">版本: ${d.version || '未知'}</p>
                <p>${d.description || '没有描述'}</p>
            `)
            .style('left', (event.pageX + 15) + 'px')
            .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', () => {
            this.tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    }
    
    /**
     * 重新调整图表大小
     * @private
     */
    resizeGraph() {
        const svg = d3.select(this.container).select('svg');
        if (!svg.empty()) {
            const width = this.container.clientWidth;
            const height = this.container.clientHeight;
            
            svg.attr('width', width)
               .attr('height', height)
               .attr('viewBox', [0, 0, width, height]);
            
            // 更新力模拟的中心
            this.simulation.force('center', d3.forceCenter(width / 2, height / 2));
            this.simulation.alpha(0.3).restart();
        }
    }
}

// 创建依赖关系图实例
const dependencyGraph = new DependencyGraph();

/**
 * 显示依赖关系图
 * @param {string} packageName - 包名
 */
export function showDependencyGraph(packageName) {
    dependencyGraph.show(packageName);
}

export default {
    showDependencyGraph
};
