document.addEventListener('DOMContentLoaded', () => {
    console.log('Orange Cat Cloud Monitor Script v1.7 Loaded');
    fetchLogs();
    fetchWork();
});

async function fetchLogs() {
    const container = document.getElementById('log-container');
    try {
        const response = await fetch('log.md');
        if (!response.ok) throw new Error('Failed to load logs');
        const text = await response.text();
        
        const logs = parseLogs(text);
        renderLogs(logs, container);
    } catch (error) {
        container.innerHTML = `<div class="empty-state">无法加载开发日志 (${error.message})</div>`;
    }
}

async function fetchWork() {
    const container = document.getElementById('projects-container');
    try {
        const response = await fetch('work.md');
        if (!response.ok) throw new Error('Failed to load projects');
        const text = await response.text();
        
        const projects = parseWork(text);
        renderProjects(projects, container);
    } catch (error) {
        container.innerHTML = `<div class="empty-state">无法加载项目进度 (${error.message})</div>`;
    }
}

function parseLogs(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const logs = [];
    let currentDate = null;
    let currentEntries = [];

    const dateRegex = /^\d{4}\.\d{2}\.\d{2}$/;

    lines.forEach(line => {
        if (dateRegex.test(line)) {
            if (currentDate) {
                logs.push({ date: currentDate, entries: [...currentEntries] });
            }
            currentDate = line;
            currentEntries = [];
        } else {
            if (currentDate) {
                // Parse context and message
                // Prioritize English colon ':' as the separator between Context and Message
                // e.g. "项目:自动驾驶.环境搭建:已全部完成" -> Context: "项目:自动驾驶.环境搭建", Message: "已全部完成"
                let context = '🐱'; // Default context for standalone logs
                let message = line;
                
                // Use lastIndexOf to treat earlier colons as part of the structure/context
                const splitIndex = line.lastIndexOf(':');
                
                if (splitIndex !== -1) {
                    context = line.substring(0, splitIndex).trim();
                    message = line.substring(splitIndex + 1).trim();
                }

                currentEntries.push({ context, message });
            }
        }
    });

    if (currentDate && currentEntries.length > 0) {
        logs.push({ date: currentDate, entries: currentEntries });
    }

    return logs.reverse();
}

function renderLogs(logs, container) {
    container.innerHTML = '';
    logs.forEach(log => {
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        let lastContext = null;

        const itemsHtml = log.entries.map(entry => {
            let contextClass = '';
            if (entry.context) {
                if (entry.context.includes('项目')) contextClass = 'ctx-project';
                else if (entry.context.includes('任务')) contextClass = 'ctx-task';
                else if (entry.context.includes('技能')) contextClass = 'ctx-skill';
                else if (entry.context === '🐱') contextClass = 'ctx-cat';
            }

            // Check for Status Update
            // Keywords: 进行中, 已完成, 已全部完成, 未开始, 失败, 无法进行, 放弃, 开始, 重启, 恢复
            // Also accept percentages like "50%"
            const statusKeywords = ['已完成', '已全部完成', '未开始', '进行中', '失败', '无法进行', '放弃', '开始', '重启', '恢复'];
            const successKeywords = ['已完成', '已全部完成'];
            const failureKeywords = ['失败', '无法进行', '放弃'];
            const restartKeywords = ['开始', '重启', '恢复'];
            
            const isPercentage = /^\d+%$/.test(entry.message);
            const isStatusMsg = statusKeywords.some(kw => entry.message.includes(kw)) || isPercentage;
            
            // Determine relation to previous context
            // We want to group if:
            // 1. Exact match
            // 2. Parent -> Child (e.g. "Proj" -> "Proj.Sub")
            // 3. Siblings (e.g. "Proj.Sub1" -> "Proj.Sub2")
            const isRelatedContext = areContextsRelated(lastContext, entry.context);
            
            const isStatusUpdate = isStatusMsg && isRelatedContext;
            
            // Update lastContext strictly to current for next iteration
            // But for visual grouping, we might want to track the "Active Root"?
            // Actually, the simple sibling check in areContextsRelated should suffice for linear scanning.
            lastContext = entry.context;

            // Determine status color class
            let statusColorClass = '';
            if (isStatusUpdate) {
                if (successKeywords.some(kw => entry.message.includes(kw))) {
                    statusColorClass = 'status-success';
                } else if (failureKeywords.some(kw => entry.message.includes(kw))) {
                    statusColorClass = 'status-failure';
                } else if (restartKeywords.some(kw => entry.message.includes(kw))) {
                    statusColorClass = 'status-restart';
                }
            }

            // Always render context, but style it differently for status updates
            const contextHtml = entry.context 
                ? `<div class="log-context ${contextClass}">${entry.context}</div>` 
                : '';
            
            const connectorHtml = isStatusUpdate 
                ? `<span class="status-connector">└──</span>` 
                : '';

            const wrapperClass = isStatusUpdate ? 'log-item-wrapper status-update' : 'log-item-wrapper';
            const messageClass = `log-message ${statusColorClass}`;
            
            return `
                <div class="${wrapperClass}" data-context="${entry.context}">
                    ${connectorHtml}
                    ${contextHtml}
                    <div class="${messageClass}">${entry.message}</div>
                </div>
            `;
        }).join('');

        logEntry.innerHTML = `
            <div class="log-date">${log.date}</div>
            <div class="log-content">
                ${itemsHtml}
            </div>
        `;
        
        // Add click handlers to the wrapper
        const wrappers = logEntry.querySelectorAll('.log-item-wrapper');
        wrappers.forEach(wrapper => {
            wrapper.addEventListener('click', (e) => {
                const text = wrapper.getAttribute('data-context');
                if (text && text !== 'undefined') {
                    handleContextClick(text);
                }
            });
        });

        container.appendChild(logEntry);
    });
}

function areContextsRelated(prev, curr) {
    if (!prev || !curr) return false;
    if (prev === curr) return true;

    // Normalize separators to dots for easier handling
    const nPrev = prev.replace(/:/g, '.');
    const nCurr = curr.replace(/:/g, '.');

    // 1. Parent -> Child relationship (Curr starts with Prev)
    if (nCurr.startsWith(nPrev + '.')) return true;

    // 2. Child -> Parent relationship (Prev starts with Curr - rare but possible in logs)
    // Actually, usually status updates go down or stay level. 
    // If we go back up to parent, we might not want to indent? 
    // User wants "Status Log" recognition. "无法进行" implies result of a task.
    // Let's stick to Parent->Child or Sibling.

    // 3. Siblings (Share same parent)
    const getParent = (s) => {
        const lastDot = s.lastIndexOf('.');
        return lastDot === -1 ? null : s.substring(0, lastDot);
    };

    const pPrev = getParent(nPrev);
    const pCurr = getParent(nCurr);

    // If both have parents and parents are same
    if (pPrev && pCurr && pPrev === pCurr) return true;
    
    // Also handle "Grandchild" skipping or fuzzy matching?
    // Let's rely on common prefix length being significant?
    // User Example: "项目:挑战杯:自动驾驶" vs "项目:挑战杯:自动驾驶.测试实车"
    // nPrev = "项目.挑战杯.自动驾驶"
    // nCurr = "项目.挑战杯.自动驾驶.测试实车"
    // nCurr starts with nPrev. Matches Case 1.

    // User Example 2 (Siblings):
    // Prev: "项目:挑战杯:自动驾驶.测试实车" (nPrev = ...自动驾驶.测试实车)
    // Curr: "项目:挑战杯:自动驾驶.PID与ROS" (nCurr = ...自动驾驶.PID与ROS)
    // pPrev = "...自动驾驶"
    // pCurr = "...自动驾驶"
    // Match Case 3.

    return false;
}

function handleContextClick(contextText) {
    console.log('Clicked context:', contextText);
    const cards = document.querySelectorAll('.project-card');
    let bestMatch = null;
    let maxLen = -1;

    // Normalize context for matching: 
    // 1. Replace dots with colons
    // 2. Remove all whitespace (to handle "Type: Name" vs "Type:Name")
    const normalizedContext = contextText.replace(/\./g, ':').replace(/\s+/g, '');

    cards.forEach(card => {
        const type = card.getAttribute('data-type');
        const name = card.getAttribute('data-name');
        
        // Construct full key and normalize
        const fullKey = `${type}:${name}`;
        const normalizedKey = fullKey.replace(/\./g, ':').replace(/\s+/g, '');

        // Check if normalized context starts with normalized key
        if (normalizedContext.startsWith(normalizedKey)) {
            // Check boundary
            const rest = normalizedContext.substring(normalizedKey.length);
            // Valid separators after match: end of string, or ':' (since we normalized '.' to ':')
            if (rest.length === 0 || rest.startsWith(':')) {
                if (normalizedKey.length > maxLen) {
                    maxLen = normalizedKey.length;
                    bestMatch = card;
                }
            }
        }
    });

    if (bestMatch) {
        console.log('Match found:', bestMatch.getAttribute('data-name'));
        scrollToCard(bestMatch);
    } else {
        console.log('No match found for:', contextText);
        console.log('Normalized context:', normalizedContext);
    }
}

function scrollToCard(card) {
    // Check layout mode
    const isVertical = window.matchMedia("(max-aspect-ratio: 1/1)").matches;

    if (isVertical) {
        // Vertical layout: Body scrolls
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Add a highlight flash with longer duration for vertical scroll
        flashHighlight(card, 5000);
    } else {
        // Horizontal layout: Project container scrolls
        // The scrollable container IS the #projects-container (which has .panel-content class)
        const container = document.getElementById('projects-container');
        
        if (container) {
            // Calculate position to scroll to
            // We want the card to be near the top, but with some padding (e.g. 20px)
            // Or centered if possible. Let's aim for 20px from top of container.
            
            // Current scroll position
            const containerScrollTop = container.scrollTop;
            
            // Distance from card top to container top
            const cardRect = card.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            
            const relativeTop = cardRect.top - containerRect.top;
            
            const targetScrollTop = containerScrollTop + relativeTop - 20; // 20px padding
            
            container.scrollTo({
                top: targetScrollTop,
                behavior: 'smooth'
            });
            
            flashHighlight(card, 800);
        }
    }
}

function flashHighlight(element, duration = 600) {
    // Add a temporary highlight class or inline style
    const originalTransition = element.style.transition;
    const originalShadow = element.style.boxShadow;
    const originalTransform = element.style.transform;
    
    element.style.transition = 'all 0.3s ease';
    element.style.boxShadow = '0 0 20px var(--primary-orange)';
    element.style.transform = 'scale(1.02)';
    
    // Calculate fade out start time
    // We want the highlight to stay for most of the duration, then fade out
    const fadeOutDuration = 300;
    const holdDuration = Math.max(0, duration - fadeOutDuration);

    setTimeout(() => {
        element.style.boxShadow = originalShadow;
        element.style.transform = originalTransform;
        
        setTimeout(() => {
            element.style.transition = originalTransition;
        }, fadeOutDuration);
    }, holdDuration);
}

function parseWork(text) {
    const lines = text.split('\n');
    const projects = [];
    let currentProject = null;

    // Regex to capture Type (up to first colon or dot) and Name (rest)
    // Supports nested colons in Name (e.g. "Type:Name:SubName{")
    // Now also supports dot separator for cases like "任务.Name{"
    const headerRegex = /^([^:.]+)(?::|\.)(.+)\{$/;
    const endRegex = /^\s*\}$/;

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        if (endRegex.test(trimmed)) {
            if (currentProject) {
                projects.push(currentProject);
                currentProject = null;
            }
            return;
        }

        const headerMatch = trimmed.match(headerRegex);
        if (headerMatch) {
            currentProject = {
                type: headerMatch[1].trim(),
                name: headerMatch[2].trim(),
                items: []
            };
            return;
        }

        if (currentProject) {
            const dotIndex = trimmed.lastIndexOf('.');
            if (dotIndex !== -1) {
                const name = trimmed.substring(0, dotIndex).trim();
                const status = trimmed.substring(dotIndex + 1).trim();
                currentProject.items.push({ name, status });
            }
        }
    });

    return projects;
}

function renderProjects(projects, container) {
    container.innerHTML = '';

    // Sorting Logic
    // 1. Type Order: Project (项目) -> Task (任务) -> Skill (技能)
    // 2. Completion: Incomplete -> Completed
    
    // Helper to determine if a project is fully completed
    const isCompleted = (p) => {
        return p.items.length > 0 && p.items.every(i => i.status === '已完成' || i.status === '100%');
    };

    // Helper to determine if a project is fully failed
    const isFailed = (p) => {
        return p.items.length > 0 && p.items.every(i => 
            i.status === '失败' || 
            i.status === '放弃' || 
            i.status === '无法进行' ||
            i.status.includes('失败')
        );
    };

    const typeOrder = { '项目': 1, '任务': 2, '技能': 3 };

    projects.sort((a, b) => {
        const typeA = typeOrder[a.type] || 99;
        const typeB = typeOrder[b.type] || 99;

        if (typeA !== typeB) {
            return typeA - typeB;
        }

        // Same type, check completion/failure
        const doneA = isCompleted(a) || isFailed(a);
        const doneB = isCompleted(b) || isFailed(b);

        if (doneA !== doneB) {
            return doneA ? 1 : -1; // Completed/Failed goes to bottom
        }

        return 0; // Maintain original order otherwise
    });

    projects.forEach(project => {
        const card = document.createElement('div');
        card.className = 'project-card';
        // Add data attributes for linking
        card.setAttribute('data-type', project.type);
        card.setAttribute('data-name', project.name);
        
        // Header Style based on Type
        let headerClass = '';
        if (project.type === '项目') headerClass = 'header-project';
        else if (project.type === '任务') headerClass = 'header-task';
        else if (project.type === '技能') headerClass = 'header-skill';

        // Check Project Status
        const isProjectCompleted = isCompleted(project);
        const isProjectFailed = isFailed(project);
        
        let titleCompletedClass = '';
        let contentCompletedClass = '';

        if (isProjectCompleted) {
            titleCompletedClass = 'completed-line';
            contentCompletedClass = 'content-completed';
        } else if (isProjectFailed) {
            titleCompletedClass = 'completed-line'; // Also strike through for failed
            contentCompletedClass = 'content-failed';
        }

        let subItemsHtml = '';
        
        project.items.forEach(item => {
            const isPercent = item.status.includes('%');
            let dotClass = 'dot-pending';
            let statusTextClass = 'status-pending';
            let progressBar = '';
            
            // Special handling: "100%" is effectively completed
            if (item.status === '100%') {
                dotClass = 'dot-completed';
                statusTextClass = 'status-completed';
                progressBar = `
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: 100%; background: var(--success);"></div>
                    </div>
                `;
            }
            else if (isPercent) {
                const percentVal = parseInt(item.status);
                dotClass = 'dot-progress';
                statusTextClass = 'status-progress';
                progressBar = `
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: ${percentVal}%"></div>
                    </div>
                `;
            } else {
                if (item.status === '已完成') {
                    dotClass = 'dot-completed';
                    statusTextClass = 'status-completed';
                }
                else if (item.status === '失败' || item.status.includes('放弃') || item.status === '无法进行') {
                    dotClass = 'dot-failed';
                    statusTextClass = 'status-failed';
                }
                else if (item.status === '进行中') {
                    dotClass = 'dot-progress';
                    statusTextClass = 'status-progress';
                }
            }

            // Restore "Progress" label if name is empty
            const displayName = item.name ? item.name : '进度';
            const nameHtml = `
                <div class="sub-item-name">
                    <span class="status-dot ${dotClass}"></span>
                    <span>${displayName}</span>
                </div>
            `;

            subItemsHtml += `
                <div class="sub-item">
                    <div class="sub-item-header">
                        ${nameHtml}
                        <span class="status-text ${statusTextClass}">${item.status}</span>
                    </div>
                    ${progressBar}
                </div>
            `;
        });

        card.innerHTML = `
            <div class="project-header ${headerClass}">
                <span class="project-type">${project.type}</span>
                <span class="project-title ${titleCompletedClass}">${project.name}</span>
            </div>
            <div class="project-content ${contentCompletedClass}">
                ${subItemsHtml}
            </div>
        `;
        
        container.appendChild(card);
    });
}
