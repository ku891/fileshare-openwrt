let currentFiles = [];
let currentImageFile = null;
let autoSaveTimer = null;
let isAutoSaving = false;
let accessPassword = localStorage.getItem('accessPassword') || '';

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    checkPasswordRequirement();
    setupFileUpload();
    setupTextShare();
});

// 检查是否需要密码
async function checkPasswordRequirement() {
    try {
        // 如果有保存的密码，先尝试使用
        if (accessPassword) {
            const response = await fetch('/api/files', {
                headers: {
                    'x-access-password': accessPassword
                }
            });
            
            if (response.ok) {
                // 保存的密码有效，直接显示内容
                document.getElementById('mainContent').style.display = 'block';
                loadFilesWithPassword();
                loadSharedTextWithPassword();
                return;
            } else if (response.status === 401) {
                const result = await response.json();
                if (result.locked) {
                    // 账户被锁定
                    showLockedScreen(result.remainingHours);
                    return;
                }
                // 保存的密码无效，清除
                localStorage.removeItem('accessPassword');
                accessPassword = '';
            }
        }
        
        // 没有保存的密码或密码无效，检查是否需要密码
        const response = await fetch('/api/files');
        
        if (response.status === 401) {
            const result = await response.json();
            if (result.requiresPassword) {
                if (result.locked) {
                    // 账户被锁定
                    showLockedScreen(result.remainingHours);
                } else {
                    // 需要密码，显示密码输入界面
                    document.getElementById('passwordScreen').style.display = 'block';
                    document.getElementById('passwordInput').focus();
                }
            }
        } else if (response.ok) {
            // 不需要密码，直接显示内容
            document.getElementById('mainContent').style.display = 'block';
            loadFiles();
            loadSharedText();
        }
    } catch (error) {
        console.error('检查密码要求失败:', error);
    }
}

// 显示锁定界面
function showLockedScreen(remainingHours) {
    document.body.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
            <div style="background: white; padding: 40px; border-radius: 15px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
                <h1 style="color: #dc3545; margin-bottom: 20px;">🔒 账户已被锁定</h1>
                <p style="font-size: 1.2rem; margin-bottom: 10px;">密码错误次数过多</p>
                <p style="font-size: 1.5rem; color: #667eea; font-weight: bold;">剩余时间：${remainingHours} 小时</p>
                <p style="margin-top: 20px; color: #666;">请稍后再试</p>
            </div>
        </div>
    `;
}

// 验证密码
async function checkPassword() {
    const passwordInput = document.getElementById('passwordInput');
    const passwordError = document.getElementById('passwordError');
    const password = passwordInput.value;
    
    if (!password) {
        passwordError.textContent = '请输入密码';
        return;
    }
    
    passwordError.textContent = '';
    accessPassword = password;
    
    try {
        const response = await fetch('/api/files', {
            headers: {
                'x-access-password': accessPassword
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // 密码正确，保存到 localStorage
            localStorage.setItem('accessPassword', password);
            
            // 显示主内容
            document.getElementById('passwordScreen').style.display = 'none';
            document.getElementById('mainContent').style.display = 'block';
            loadFilesWithPassword();
            loadSharedTextWithPassword();
        } else if (response.status === 401) {
            if (result.locked) {
                // 账户被锁定
                showLockedScreen(result.remainingHours);
            } else {
                // 密码错误
                passwordError.textContent = result.message || '密码错误';
                passwordInput.value = '';
                passwordInput.focus();
            }
        }
    } catch (error) {
        passwordError.textContent = '网络错误，请重试';
    }
}

// 带密码加载文件列表
async function loadFilesWithPassword() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';

    try {
        const response = await fetch('/api/files', {
            headers: {
                'x-access-password': accessPassword
            }
        });
        
        const result = await response.json();

        if (response.ok) {
            currentFiles = result;
            displayFiles(result);
        } else if (response.status === 401) {
            if (result.locked) {
                // 账户被锁定
                alert(`账户已被锁定\n原因：密码错误次数过多\n剩余时间：${result.remainingHours}小时\n\n请稍后再试`);
                document.body.innerHTML = `
                    <div style="display: flex; justify-content: center; align-items: center; height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                        <div style="background: white; padding: 40px; border-radius: 15px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
                            <h1 style="color: #dc3545; margin-bottom: 20px;">🔒 账户已被锁定</h1>
                            <p style="font-size: 1.2rem; margin-bottom: 10px;">密码错误次数过多</p>
                            <p style="font-size: 1.5rem; color: #667eea; font-weight: bold;">剩余时间：${result.remainingHours} 小时</p>
                            <p style="margin-top: 20px; color: #666;">请稍后再试</p>
                        </div>
                    </div>
                `;
            } else {
                showToast(result.message || '密码错误', 'error');
                showPasswordPrompt();
            }
        } else {
            showToast('加载文件列表失败', 'error');
        }
    } catch (error) {
        showToast('加载文件列表失败：网络错误', 'error');
    }
}

// 带密码加载共享文本
async function loadSharedTextWithPassword() {
    try {
        const response = await fetch('/api/shared-text', {
            headers: {
                'x-access-password': accessPassword
            }
        });
        const result = await response.json();
        
        if (response.ok) {
            const textArea = document.getElementById('sharedTextArea');
            textArea.value = result.text;
            updateTextLength();
        }
    } catch (error) {
        console.error('加载共享文本失败:', error);
    }
}

// 设置文件上传功能
function setupFileUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    // 拖拽上传
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', function(e) {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        uploadFiles(files);
    });

    // 点击上传
    fileInput.addEventListener('change', function(e) {
        const files = e.target.files;
        uploadFiles(files);
    });
}

// 上传文件
async function uploadFiles(files) {
    if (files.length === 0) return;

    const formData = new FormData();
    for (let file of files) {
        formData.append('files', file);
    }

    try {
        const headers = {};
        if (accessPassword) {
            headers['x-access-password'] = accessPassword;
        }
        
        const response = await fetch('/api/upload', {
            method: 'POST',
            headers: headers,
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            showToast('文件上传成功！', 'success');
            if (accessPassword) {
                loadFilesWithPassword();
            } else {
                loadFiles();
            }
        } else if (response.status === 401) {
            showToast('需要密码才能上传', 'error');
            showPasswordPrompt();
        } else {
            showToast('上传失败：' + result.error, 'error');
        }
    } catch (error) {
        showToast('上传失败：网络错误', 'error');
    } finally {
        document.getElementById('fileInput').value = '';
    }
}

// 加载文件列表
async function loadFiles() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';

    try {
        const response = await fetch('/api/files');
        const files = await response.json();

        if (response.ok) {
            currentFiles = files;
            displayFiles(files);
        } else {
            showToast('加载文件列表失败', 'error');
        }
    } catch (error) {
        showToast('加载文件列表失败：网络错误', 'error');
    }
}

// 显示文件列表
function displayFiles(files) {
    const fileList = document.getElementById('fileList');
    
    if (files.length === 0) {
        fileList.innerHTML = '<div class="loading"><i class="fas fa-folder-open"></i><br>暂无文件</div>';
        return;
    }

    fileList.innerHTML = files.map(file => {
        const fileIcon = getFileIcon(file.name, file.isImage, file.isVideo);
        const fileSize = formatFileSize(file.size);
        const uploadTime = new Date(file.uploadTime).toLocaleString();

        return `
            <div class="file-item" onclick="handleFileClick('${file.name}', ${file.isImage}, ${file.isVideo})">
                <div class="file-item-header">
                    ${file.isImage || file.isVideo ? `
                        <div class="file-thumbnail">
                            ${file.isVideo ? `
                                <video 
                                    src="/uploads/${file.name}" 
                                    preload="metadata" 
                                    onloadedmetadata="this.currentTime=0.1"
                                    onerror="this.onerror=null; this.parentElement.innerHTML='${fileIcon}'">
                                    <source src="/uploads/${file.name}" type="video/mp4">
                                    <source src="/uploads/${file.name}" type="video/quicktime">
                                    <source src="/uploads/${file.name}" type="video/x-msvideo">
                                    <source src="/uploads/${file.name}">
                                </video>
                                <div class="video-play-icon">
                                    <i class="fas fa-play-circle"></i>
                                </div>
                            ` : `
                                <img src="/uploads/${file.name}" alt="${file.name}" onerror="this.onerror=null; this.parentElement.innerHTML='${fileIcon}'">
                            `}
                        </div>
                    ` : `
                        <div class="file-icon">${fileIcon}</div>
                    `}
                </div>
                <div class="file-item-body">
                    <div class="file-name">${file.name}</div>
                    <div class="file-info">
                        <div>大小: ${fileSize}</div>
                        <div>上传时间: ${uploadTime}</div>
                    </div>
                    <div class="file-actions">
                        ${file.isImage ? `<button class="btn btn-preview" onclick="event.stopPropagation(); previewImage('${file.name}')">
                            <i class="fas fa-eye"></i> 预览
                        </button>` : ''}
                        ${file.isVideo ? `<button class="btn btn-preview" onclick="event.stopPropagation(); previewVideo('${file.name}')">
                            <i class="fas fa-play"></i> 播放
                        </button>` : ''}
                        <button class="btn btn-download" onclick="event.stopPropagation(); downloadFile('${file.name}')">
                            <i class="fas fa-download"></i> 下载
                        </button>
                        <button class="btn btn-delete" onclick="event.stopPropagation(); deleteFile('${file.name}')">
                            <i class="fas fa-trash"></i> 删除
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 获取文件图标
function getFileIcon(filename, isImage, isVideo) {
    if (isImage) {
        return '<i class="fas fa-image"></i>';
    }
    
    if (isVideo) {
        return '<i class="fas fa-file-video"></i>';
    }
    
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
        // 文档
        'pdf': 'fas fa-file-pdf',
        'doc': 'fas fa-file-word',
        'docx': 'fas fa-file-word',
        'txt': 'fas fa-file-alt',
        'rtf': 'fas fa-file-alt',
        'odt': 'fas fa-file-alt',
        'pages': 'fas fa-file-alt',
        
        // 表格
        'xls': 'fas fa-file-excel',
        'xlsx': 'fas fa-file-excel',
        'csv': 'fas fa-file-csv',
        'ods': 'fas fa-file-excel',
        'numbers': 'fas fa-file-excel',
        
        // 演示文稿
        'ppt': 'fas fa-file-powerpoint',
        'pptx': 'fas fa-file-powerpoint',
        'odp': 'fas fa-file-powerpoint',
        'key': 'fas fa-file-powerpoint',
        
        // 压缩文件
        'zip': 'fas fa-file-archive',
        'rar': 'fas fa-file-archive',
        '7z': 'fas fa-file-archive',
        'tar': 'fas fa-file-archive',
        'gz': 'fas fa-file-archive',
        'bz2': 'fas fa-file-archive',
        
        // 音频
        'mp3': 'fas fa-file-audio',
        'wav': 'fas fa-file-audio',
        'flac': 'fas fa-file-audio',
        'aac': 'fas fa-file-audio',
        'ogg': 'fas fa-file-audio',
        'm4a': 'fas fa-file-audio',
        'wma': 'fas fa-file-audio',
        
        // 代码文件
        'js': 'fas fa-file-code',
        'html': 'fas fa-file-code',
        'css': 'fas fa-file-code',
        'json': 'fas fa-file-code',
        'xml': 'fas fa-file-code',
        'py': 'fas fa-file-code',
        'java': 'fas fa-file-code',
        'cpp': 'fas fa-file-code',
        'c': 'fas fa-file-code',
        'php': 'fas fa-file-code',
        'rb': 'fas fa-file-code',
        'go': 'fas fa-file-code',
        'ts': 'fas fa-file-code',
        
        // 其他
        'exe': 'fas fa-cog',
        'dmg': 'fas fa-hdd',
        'iso': 'fas fa-hdd',
        'bin': 'fas fa-hdd'
    };
    
    const iconClass = iconMap[ext] || 'fas fa-file';
    return `<i class="${iconClass}"></i>`;
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 处理文件点击
function handleFileClick(filename, isImage, isVideo) {
    if (isImage) {
        previewImage(filename);
    } else if (isVideo) {
        previewVideo(filename);
    }
    // 移除自动下载功能，让用户使用下载按钮
}

// 预览图片
function previewImage(filename) {
    currentImageFile = filename;
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const modalTitle = document.getElementById('modalTitle');
    const modalSize = document.getElementById('modalSize');
    
    // 移除之前的视频元素
    const existingVideo = modal.querySelector('video');
    if (existingVideo) {
        existingVideo.remove();
    }
    
    const file = currentFiles.find(f => f.name === filename);
    if (file) {
        modalImage.src = `/uploads/${filename}`;
        modalImage.style.display = 'block';
        modalTitle.textContent = filename;
        modalSize.textContent = `大小: ${formatFileSize(file.size)}`;
        modal.style.display = 'block';
    }
}

// 关闭图片预览
function closeImageModal() {
    const modal = document.getElementById('imageModal');
    
    // 停止视频播放
    const video = modal.querySelector('video');
    if (video) {
        video.pause();
        video.src = '';
        video.remove();
    }
    
    modal.style.display = 'none';
    currentImageFile = null;
}

// 预览视频
function previewVideo(filename) {
    currentImageFile = filename;
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const modalTitle = document.getElementById('modalTitle');
    const modalSize = document.getElementById('modalSize');
    
    const file = currentFiles.find(f => f.name === filename);
    if (file) {
        // 创建视频元素
        const video = document.createElement('video');
        video.src = `/uploads/${filename}`;
        video.controls = true;
        video.autoplay = true;
        video.style.maxWidth = '100%';
        video.style.maxHeight = '500px';
        video.style.borderRadius = '10px';
        
        // 替换图片元素
        modalImage.src = '';
        modalImage.style.display = 'none';
        
        // 将视频添加到模态框
        const modalContent = modal.querySelector('.modal-content');
        const existingVideo = modalContent.querySelector('video');
        if (existingVideo) {
            existingVideo.remove();
        }
        modalImage.parentNode.insertBefore(video, modalImage.nextSibling);
        
        modalTitle.textContent = filename;
        modalSize.textContent = `大小: ${formatFileSize(file.size)}`;
        modal.style.display = 'block';
    }
}

// 下载文件
async function downloadFile(filename) {
    try {
        const response = await fetch(`/api/download/${filename}`);
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            window.URL.revokeObjectURL(url);
        } else {
            const result = await response.json();
            showToast('下载失败：' + result.error, 'error');
        }
    } catch (error) {
        showToast('下载失败：网络错误', 'error');
    }
}

// 删除文件
async function deleteFile(filename) {
    if (!confirm(`确定要删除文件 "${filename}" 吗？`)) return;

    try {
        const headers = {};
        if (accessPassword) {
            headers['x-access-password'] = accessPassword;
        }
        
        const response = await fetch(`/api/delete/${filename}`, {
            method: 'DELETE',
            headers: headers
        });

        const result = await response.json();

        if (response.ok) {
            showToast('文件删除成功', 'success');
            if (accessPassword) {
                loadFilesWithPassword();
            } else {
                loadFiles();
            }
            // 如果是在预览模态框中删除，关闭模态框
            if (currentImageFile === filename) {
                closeImageModal();
            }
        } else if (response.status === 401) {
            showToast('需要密码才能删除', 'error');
            showPasswordPrompt();
        } else {
            showToast('删除失败：' + result.error, 'error');
        }
    } catch (error) {
        showToast('删除失败：网络错误', 'error');
    }
}

// 显示消息提示
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// 点击模态框外部关闭
window.onclick = function(event) {
    const modal = document.getElementById('imageModal');
    if (event.target === modal) {
        closeImageModal();
    }
}

// 设置文本共享功能
function setupTextShare() {
    const textArea = document.getElementById('sharedTextArea');
    const textLength = document.getElementById('textLength');
    
    // 监听文本变化
    textArea.addEventListener('input', function() {
        const length = this.value.length;
        textLength.textContent = length;
        
        // 清除之前的定时器
        if (autoSaveTimer) {
            clearTimeout(autoSaveTimer);
        }
        
        // 设置自动保存定时器（2秒后自动保存）
        autoSaveTimer = setTimeout(() => {
            if (!isAutoSaving) {
                saveSharedText(true); // true 表示自动保存
            }
        }, 2000);
    });
    
    // 定期同步文本内容（每30秒检查一次）
    setInterval(syncSharedText, 30000);
}

// 加载共享文本
async function loadSharedText() {
    try {
        const response = await fetch('/api/shared-text');
        const result = await response.json();
        
        if (response.ok) {
            const textArea = document.getElementById('sharedTextArea');
            textArea.value = result.text;
            updateTextLength();
        }
    } catch (error) {
        console.error('加载共享文本失败:', error);
    }
}

// 保存共享文本
async function saveSharedText(isAutoSave = false) {
    if (isAutoSaving) return;
    
    const textArea = document.getElementById('sharedTextArea');
    const text = textArea.value;
    const indicator = document.getElementById('autoSaveIndicator');
    
    isAutoSaving = true;
    
    if (!isAutoSave) {
        indicator.textContent = '保存中...';
        indicator.className = 'auto-save-indicator saving';
    }
    
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (accessPassword) {
            headers['x-access-password'] = accessPassword;
        }
        
        const response = await fetch('/api/shared-text', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ text })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            if (!isAutoSave) showToast('文本保存成功！', 'success');
            indicator.textContent = '已保存';
            indicator.className = 'auto-save-indicator saved';
            setTimeout(() => {
                indicator.textContent = '';
                indicator.className = 'auto-save-indicator';
            }, 3000);
        } else if (response.status === 401) {
            if (!isAutoSave) showToast('需要密码才能保存', 'error');
            indicator.textContent = '保存失败';
            indicator.className = 'auto-save-indicator error';
            setTimeout(() => {
                indicator.textContent = '';
                indicator.className = 'auto-save-indicator';
            }, 3000);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        if (!isAutoSave) showToast('保存失败：' + error.message, 'error');
        indicator.textContent = '保存失败';
        indicator.className = 'auto-save-indicator error';
        setTimeout(() => {
            indicator.textContent = '';
            indicator.className = 'auto-save-indicator';
        }, 3000);
    } finally {
        isAutoSaving = false;
    }
}

// 清空共享文本
async function clearSharedText() {
    if (!confirm('确定要清空所有文本内容吗？')) return;
    
    const textArea = document.getElementById('sharedTextArea');
    textArea.value = '';
    updateTextLength();
    
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (accessPassword) {
            headers['x-access-password'] = accessPassword;
        }
        
        const response = await fetch('/api/shared-text', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ text: '' })
        });
        
        if (response.ok) {
            showToast('文本已清空', 'success');
        } else if (response.status === 401) {
            showToast('需要密码才能清空', 'error');
            showPasswordPrompt();
        } else {
            throw new Error('清空失败');
        }
    } catch (error) {
        showToast('清空失败：' + error.message, 'error');
    }
}

// 同步共享文本（检查是否有更新）
async function syncSharedText() {
    if (isAutoSaving) return;
    
    try {
        const headers = {};
        if (accessPassword) {
            headers['x-access-password'] = accessPassword;
        }
        
        const response = await fetch('/api/shared-text', { headers });
        const result = await response.json();
        
        if (response.ok) {
            const textArea = document.getElementById('sharedTextArea');
            const currentText = textArea.value;
            
            // 如果服务器上的文本与当前文本不同，且当前文本没有被修改
            if (result.text !== currentText && !textArea.matches(':focus')) {
                textArea.value = result.text;
                updateTextLength();
            }
        }
    } catch (error) {
        console.error('同步文本失败:', error);
    }
}

// 更新文本长度显示
function updateTextLength() {
    const textArea = document.getElementById('sharedTextArea');
    const textLength = document.getElementById('textLength');
    textLength.textContent = textArea.value.length;
}

// 复制全部文本
function copyAllText() {
    const textArea = document.getElementById('sharedTextArea');
    const text = textArea.value;
    
    if (!text) {
        showToast('文本内容为空，无法复制', 'error');
        return;
    }
    
    // 使用现代 Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('文本已复制到剪贴板', 'success');
        }).catch(() => {
            // 降级方案：使用传统方法
            fallbackCopyText(text);
        });
    } else {
        // 降级方案：使用传统方法
        fallbackCopyText(text);
    }
}

// 降级复制方法
function fallbackCopyText(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showToast('文本已复制到剪贴板', 'success');
        } else {
            showToast('复制失败，请手动复制', 'error');
        }
    } catch (err) {
        showToast('复制失败，请手动复制', 'error');
    }
    
    document.body.removeChild(textArea);
}

// 键盘事件
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeImageModal();
    }
    
    // Ctrl+S 保存文本
    if (event.ctrlKey && event.key === 's') {
        event.preventDefault();
        saveSharedText();
    }
});
