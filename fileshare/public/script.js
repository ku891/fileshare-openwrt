let currentFiles = [];
let currentImageFile = null;
let currentTextFile = null;
let autoSaveTimer = null;
let isAutoSaving = false;
let accessPassword = localStorage.getItem('accessPassword') || '';
let selectedFiles = new Set();
let currentTextNoteId = null;
let switchingTextNote = false;
const TEXT_NOTE_STORAGE_KEY = 'fileshareTextNoteId';

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
                loadTextShareAfterAuth();
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
            loadTextShareAfterAuth();
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
            loadTextShareAfterAuth();
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
                showLockedScreen(result.remainingHours);
            } else {
                showToast(result.message || '密码错误', 'error');
                document.getElementById('passwordScreen').style.display = 'block';
            }
        } else {
            showToast('加载文件列表失败', 'error');
        }
    } catch (error) {
        showToast('加载文件列表失败：网络错误', 'error');
    }
}

function textShareHeaders(json) {
    const headers = json ? { 'Content-Type': 'application/json' } : {};
    if (accessPassword) {
        headers['x-access-password'] = accessPassword;
    }
    return headers;
}

async function loadTextShareAfterAuth() {
    try {
        const response = await fetch('/api/shared-texts', {
            headers: textShareHeaders(false)
        });
        const data = await response.json();
        if (!response.ok) {
            if (response.status === 401) {
                showToast(data.message || '需要密码', 'error');
                document.getElementById('passwordScreen').style.display = 'block';
            }
            return;
        }
        const notes = data.notes || [];
        fillTextNoteSelect(notes);
        const prefer = localStorage.getItem(TEXT_NOTE_STORAGE_KEY);
        const pick = (prefer && notes.some((n) => n.id === prefer))
            ? prefer
            : (notes[0] && notes[0].id);
        if (pick) {
            await loadTextNoteIntoEditor(pick, { skipSaveBefore: true });
        }
    } catch (error) {
        console.error('加载文本笔记失败:', error);
    }
}

function fillTextNoteSelect(notes) {
    const sel = document.getElementById('textNoteSelect');
    if (!sel) return;
    sel.innerHTML = '';
    notes.forEach((n) => {
        const opt = document.createElement('option');
        opt.value = n.id;
        opt.textContent = n.title || '未命名';
        sel.appendChild(opt);
    });
}

async function flushSaveCurrentNote() {
    if (!currentTextNoteId) return;
    const text = document.getElementById('sharedTextArea').value;
    try {
        const response = await fetch(`/api/shared-texts/${currentTextNoteId}`, {
            method: 'POST',
            headers: textShareHeaders(true),
            body: JSON.stringify({ text })
        });
        if (response.ok) {
            const data = await response.json();
            const sel = document.getElementById('textNoteSelect');
            const opt = sel && sel.querySelector(`option[value="${currentTextNoteId}"]`);
            if (opt && data.title) opt.textContent = data.title;
        }
    } catch (e) {
        console.warn('切换前保存笔记失败:', e);
    }
}

async function loadTextNoteIntoEditor(id, options = {}) {
    const { skipSaveBefore = false } = options;
    if (!skipSaveBefore && currentTextNoteId && currentTextNoteId !== id) {
        await flushSaveCurrentNote();
    }
    switchingTextNote = true;
    try {
        const response = await fetch(`/api/shared-texts/${encodeURIComponent(id)}`, {
            headers: textShareHeaders(false)
        });
        const result = await response.json();
        if (!response.ok) {
            showToast(result.error || '加载笔记失败', 'error');
            return;
        }
        const sel = document.getElementById('textNoteSelect');
        if (sel) sel.value = id;
        document.getElementById('textNoteTitle').value = result.title || '';
        document.getElementById('sharedTextArea').value = result.text || '';
        currentTextNoteId = id;
        localStorage.setItem(TEXT_NOTE_STORAGE_KEY, id);
        updateTextLength();
    } finally {
        switchingTextNote = false;
    }
}

async function onTextNoteSelectChange() {
    if (switchingTextNote) return;
    const sel = document.getElementById('textNoteSelect');
    const newId = sel && sel.value;
    if (!newId || newId === currentTextNoteId) return;
    await flushSaveCurrentNote();
    await loadTextNoteIntoEditor(newId, { skipSaveBefore: true });
}

async function saveCurrentNoteTitle() {
    if (!currentTextNoteId) return;
    const title = document.getElementById('textNoteTitle').value.trim().slice(0, 200);
    try {
        const response = await fetch(`/api/shared-texts/${currentTextNoteId}`, {
            method: 'POST',
            headers: textShareHeaders(true),
            body: JSON.stringify({ title: title || '未命名' })
        });
        if (response.ok) {
            const data = await response.json();
            const sel = document.getElementById('textNoteSelect');
            const opt = sel && sel.querySelector(`option[value="${currentTextNoteId}"]`);
            if (opt) opt.textContent = data.title || '未命名';
        }
    } catch (e) {
        console.warn('保存标题失败:', e);
    }
}

async function createTextNote() {
    await flushSaveCurrentNote();
    try {
        const response = await fetch('/api/shared-texts', {
            method: 'POST',
            headers: textShareHeaders(true),
            body: JSON.stringify({ title: '新笔记', text: '' })
        });
        const result = await response.json();
        if (!response.ok) {
            showToast(result.error || '新建失败', 'error');
            return;
        }
        const listRes = await fetch('/api/shared-texts', { headers: textShareHeaders(false) });
        const listData = await listRes.json();
        if (listRes.ok && listData.notes) {
            fillTextNoteSelect(listData.notes);
        }
        await loadTextNoteIntoEditor(result.id, { skipSaveBefore: true });
        document.getElementById('textNoteTitle').focus();
        showToast('已新建笔记', 'success');
    } catch (e) {
        showToast('新建失败：网络错误', 'error');
    }
}

async function deleteCurrentTextNote() {
    if (!currentTextNoteId) return;
    if (!confirm('确定删除当前这篇笔记吗？（至少会保留一篇）')) return;
    try {
        const response = await fetch(`/api/shared-texts/${currentTextNoteId}`, {
            method: 'DELETE',
            headers: textShareHeaders(false)
        });
        const result = await response.json();
        if (!response.ok) {
            showToast(result.error || '删除失败', 'error');
            return;
        }
        const listRes = await fetch('/api/shared-texts', { headers: textShareHeaders(false) });
        const listData = await listRes.json();
        if (!listRes.ok || !listData.notes || !listData.notes.length) {
            showToast('列表刷新失败', 'error');
            return;
        }
        fillTextNoteSelect(listData.notes);
        const first = listData.notes[0].id;
        await loadTextNoteIntoEditor(first, { skipSaveBefore: true });
        showToast('已删除', 'success');
    } catch (e) {
        showToast('删除失败：网络错误', 'error');
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
            document.getElementById('passwordScreen').style.display = 'block';
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

// 转义 HTML 特殊字符
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 转义 JavaScript 字符串中的单引号
function escapeJsString(str) {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
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
        const isSelected = selectedFiles.has(file.name);
        
        // 转义文件名用于 JavaScript 字符串
        const escapedFileName = escapeJsString(file.name);
        // 转义文件名用于 HTML 显示
        const escapedFileNameHtml = escapeHtml(file.name);
        // URL 编码的文件名用于 URL
        const encodedFileName = encodeURIComponent(file.name);

        return `
            <div class="file-item ${isSelected ? 'selected' : ''}" data-filename="${encodedFileName}" data-is-image="${file.isImage}" data-is-video="${file.isVideo}" data-is-text="${file.isText || false}" onclick="handleFileClickFromElement(this)">
                <div class="file-checkbox" onclick="event.stopPropagation(); toggleFileSelection('${escapedFileName}')">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleFileSelection('${escapedFileName}')">
                </div>
                <div class="file-item-header">
                    ${file.isImage || file.isVideo ? `
                        <div class="file-thumbnail">
                            ${file.isVideo ? `
                                <video 
                                    src="/uploads/${encodedFileName}" 
                                    preload="metadata" 
                                    onloadedmetadata="this.currentTime=0.1"
                                    onerror="this.onerror=null; this.parentElement.innerHTML='${fileIcon}'">
                                </video>
                                <div class="video-play-icon">
                                    <i class="fas fa-play-circle"></i>
                                </div>
                            ` : `
                                <img src="/uploads/${encodedFileName}" alt="${escapedFileNameHtml}" onerror="this.onerror=null; this.parentElement.innerHTML='${fileIcon}'">
                            `}
                        </div>
                    ` : `
                        <div class="file-icon">${fileIcon}</div>
                    `}
                </div>
                <div class="file-item-body">
                    <div class="file-name">${escapedFileNameHtml}</div>
                    <div class="file-info">
                        <div>大小: ${fileSize}</div>
                        <div>上传时间: ${uploadTime}</div>
                    </div>
                    <div class="file-actions">
                        ${file.isImage ? `<button class="btn btn-preview" data-action="preview-image" data-filename="${encodedFileName}" onclick="event.stopPropagation(); previewImageFromButton(this)">
                            <i class="fas fa-eye"></i><span class="btn-text"> 预览</span>
                        </button>` : ''}
                        ${file.isVideo ? `<button class="btn btn-preview" data-action="preview-video" data-filename="${encodedFileName}" onclick="event.stopPropagation(); previewVideoFromButton(this)">
                            <i class="fas fa-play"></i><span class="btn-text"> 播放</span>
                        </button>` : ''}
                        ${file.isText ? `<button class="btn btn-edit" data-action="edit-text" data-filename="${encodedFileName}" onclick="event.stopPropagation(); editTextFileFromButton(this)" title="编辑文件">
                            <i class="fas fa-edit"></i><span class="btn-text"> 编辑</span>
                        </button>` : ''}
                        <button class="btn btn-link" data-action="copy-link" data-filename="${encodedFileName}" onclick="event.stopPropagation(); copyFileLinkFromButton(this)" title="复制文件链接">
                            <i class="fas fa-link"></i><span class="btn-text"> 复制链接</span>
                        </button>
                        <button class="btn btn-download" data-action="download" data-filename="${encodedFileName}" onclick="event.stopPropagation(); downloadFileFromButton(this)">
                            <i class="fas fa-download"></i><span class="btn-text"> 下载</span>
                        </button>
                        <button class="btn btn-delete" data-action="delete" data-filename="${encodedFileName}" onclick="event.stopPropagation(); deleteFileFromButton(this)">
                            <i class="fas fa-trash"></i><span class="btn-text"> 删除</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    updateBatchActions();
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
        'pdf': 'fas fa-file-pdf',
        'doc': 'fas fa-file-word',
        'docx': 'fas fa-file-word',
        'txt': 'fas fa-file-alt',
        'xls': 'fas fa-file-excel',
        'xlsx': 'fas fa-file-excel',
        'zip': 'fas fa-file-archive',
        'rar': 'fas fa-file-archive',
        'mp3': 'fas fa-file-audio',
        'js': 'fas fa-file-code',
        'html': 'fas fa-file-code',
        'css': 'fas fa-file-code'
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

// 处理文件点击（从元素获取数据）
function handleFileClickFromElement(element) {
    const filename = decodeURIComponent(element.getAttribute('data-filename'));
    const isImage = element.getAttribute('data-is-image') === 'true';
    const isVideo = element.getAttribute('data-is-video') === 'true';
    const isText = element.getAttribute('data-is-text') === 'true';
    
    if (isImage) {
        previewImage(filename);
    } else if (isVideo) {
        previewVideo(filename);
    } else if (isText) {
        editTextFile(filename);
    }
}

// 从按钮获取文件名并预览图片
function previewImageFromButton(button) {
    const filename = decodeURIComponent(button.getAttribute('data-filename'));
    previewImage(filename);
}

// 从按钮获取文件名并预览视频
function previewVideoFromButton(button) {
    const filename = decodeURIComponent(button.getAttribute('data-filename'));
    previewVideo(filename);
}

// 从按钮获取文件名并编辑文本
function editTextFileFromButton(button) {
    const filename = decodeURIComponent(button.getAttribute('data-filename'));
    editTextFile(filename);
}

// 从按钮获取文件名并复制链接
function copyFileLinkFromButton(button) {
    const filename = decodeURIComponent(button.getAttribute('data-filename'));
    copyFileLink(filename);
}

// 从按钮获取文件名并下载
function downloadFileFromButton(button) {
    const filename = decodeURIComponent(button.getAttribute('data-filename'));
    downloadFile(filename);
}

// 从按钮获取文件名并删除
function deleteFileFromButton(button) {
    const filename = decodeURIComponent(button.getAttribute('data-filename'));
    deleteFile(filename);
}

// 预览图片
function previewImage(filename) {
    currentImageFile = filename;
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const modalTitle = document.getElementById('modalTitle');
    const modalSize = document.getElementById('modalSize');
    
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
        const video = document.createElement('video');
        video.src = `/uploads/${filename}`;
        video.controls = true;
        video.autoplay = true;
        video.style.maxWidth = '100%';
        video.style.maxHeight = '500px';
        video.style.borderRadius = '10px';
        
        modalImage.src = '';
        modalImage.style.display = 'none';
        
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
            if (currentImageFile === filename) {
                closeImageModal();
            }
        } else if (response.status === 401) {
            showToast('需要密码才能删除', 'error');
            document.getElementById('passwordScreen').style.display = 'block';
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
    const imageModal = document.getElementById('imageModal');
    const textEditorModal = document.getElementById('textEditorModal');
    
    if (event.target === imageModal) {
        closeImageModal();
    }
    if (event.target === textEditorModal) {
        closeTextEditor();
    }
}

// 设置文本共享功能
function setupTextShare() {
    const textArea = document.getElementById('sharedTextArea');
    const textLength = document.getElementById('textLength');
    const noteSelect = document.getElementById('textNoteSelect');
    const titleInput = document.getElementById('textNoteTitle');

    if (noteSelect) {
        noteSelect.addEventListener('change', () => onTextNoteSelectChange());
    }
    if (titleInput) {
        titleInput.addEventListener('blur', () => saveCurrentNoteTitle());
    }

    textArea.addEventListener('input', function() {
        const length = this.value.length;
        textLength.textContent = length;

        if (autoSaveTimer) {
            clearTimeout(autoSaveTimer);
        }

        autoSaveTimer = setTimeout(() => {
            if (!isAutoSaving && currentTextNoteId) {
                saveSharedText(true);
            }
        }, 2000);
    });

    setInterval(syncSharedText, 30000);
}

// 保存当前笔记正文
async function saveSharedText(isAutoSave = false) {
    if (isAutoSaving || !currentTextNoteId) return;

    const textArea = document.getElementById('sharedTextArea');
    const text = textArea.value;
    const indicator = document.getElementById('autoSaveIndicator');

    isAutoSaving = true;

    if (!isAutoSave) {
        indicator.textContent = '保存中...';
        indicator.className = 'auto-save-indicator saving';
    }

    try {
        const response = await fetch(`/api/shared-texts/${currentTextNoteId}`, {
            method: 'POST',
            headers: textShareHeaders(true),
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
            throw new Error(result.error || '保存失败');
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

// 清空当前笔记正文
async function clearSharedText() {
    if (!currentTextNoteId) return;
    if (!confirm('确定要清空当前笔记的正文吗？')) return;

    const textArea = document.getElementById('sharedTextArea');
    textArea.value = '';
    updateTextLength();

    try {
        const response = await fetch(`/api/shared-texts/${currentTextNoteId}`, {
            method: 'POST',
            headers: textShareHeaders(true),
            body: JSON.stringify({ text: '' })
        });

        if (response.ok) {
            showToast('当前笔记已清空', 'success');
        } else if (response.status === 401) {
            showToast('需要密码才能清空', 'error');
            document.getElementById('passwordScreen').style.display = 'block';
        } else {
            const result = await response.json();
            throw new Error(result.error || '清空失败');
        }
    } catch (error) {
        showToast('清空失败：' + error.message, 'error');
    }
}

// 同步当前笔记（多设备协作时拉取服务器版本）
async function syncSharedText() {
    if (isAutoSaving || !currentTextNoteId) return;

    try {
        const response = await fetch(`/api/shared-texts/${currentTextNoteId}`, {
            headers: textShareHeaders(false)
        });
        const result = await response.json();

        if (response.ok) {
            const textArea = document.getElementById('sharedTextArea');
            const titleInput = document.getElementById('textNoteTitle');
            const currentText = textArea.value;

            if (result.text !== currentText && !textArea.matches(':focus')) {
                textArea.value = result.text;
                updateTextLength();
            }
            if (titleInput && !titleInput.matches(':focus') && result.title != null) {
                titleInput.value = result.title;
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
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('文本已复制到剪贴板', 'success');
        }).catch(() => {
            fallbackCopyText(text);
        });
    } else {
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

// 复制文件链接
async function copyFileLink(filename) {
    try {
        // 获取当前页面的协议、主机和端口
        const protocol = window.location.protocol; // http: 或 https:
        const host = window.location.host; // 包含端口的主机名，如 "192.168.1.1:3000"
        
        // 构建文件的完整访问链接
        const fileUrl = `${protocol}//${host}/uploads/${encodeURIComponent(filename)}`;
        
        // 复制到剪贴板
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(fileUrl);
            showToast('文件链接已复制到剪贴板', 'success');
        } else {
            // 降级方案：使用传统的复制方法
            fallbackCopyText(fileUrl);
        }
    } catch (error) {
        console.error('复制文件链接失败:', error);
        showToast('复制链接失败，请手动复制', 'error');
    }
}

// 编辑文本文件
async function editTextFile(filename) {
    currentTextFile = filename;
    const modal = document.getElementById('textEditorModal');
    const title = document.getElementById('textEditorTitle');
    const content = document.getElementById('textEditorContent');
    const info = document.getElementById('textEditorInfo');
    
    title.textContent = `编辑: ${filename}`;
    content.value = '';
    info.textContent = '加载中...';
    modal.style.display = 'block';
    
    try {
        const headers = {};
        if (accessPassword) {
            headers['x-access-password'] = accessPassword;
        }
        
        const response = await fetch(`/api/file-content/${encodeURIComponent(filename)}`, { headers });
        const result = await response.json();
        
        if (response.ok) {
            content.value = result.content;
            const fileSize = formatFileSize(result.size);
            info.textContent = `文件大小: ${fileSize}`;
            content.focus();
        } else if (response.status === 401) {
            showToast('需要密码才能访问', 'error');
            closeTextEditor();
        } else {
            showToast('加载文件失败：' + (result.error || '未知错误'), 'error');
            closeTextEditor();
        }
    } catch (error) {
        showToast('加载文件失败：网络错误', 'error');
        closeTextEditor();
    }
}

// 保存文本文件
async function saveTextFile() {
    if (!currentTextFile) return;
    
    const content = document.getElementById('textEditorContent');
    const info = document.getElementById('textEditorInfo');
    const saveBtn = document.querySelector('#textEditorModal .btn-save');
    const originalText = saveBtn.innerHTML;
    
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...';
    info.textContent = '保存中...';
    
    try {
        const headers = {
            'Content-Type': 'application/json'
        };
        if (accessPassword) {
            headers['x-access-password'] = accessPassword;
        }
        
        const response = await fetch(`/api/file-content/${encodeURIComponent(currentTextFile)}`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ content: content.value })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showToast('文件保存成功！', 'success');
            const fileSize = formatFileSize(result.size);
            info.textContent = `文件大小: ${fileSize} | 已保存`;
            
            // 更新文件列表
            if (accessPassword) {
                loadFilesWithPassword();
            } else {
                loadFiles();
            }
        } else if (response.status === 401) {
            showToast('需要密码才能保存', 'error');
        } else {
            showToast('保存失败：' + (result.error || '未知错误'), 'error');
        }
    } catch (error) {
        showToast('保存失败：网络错误', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
}

// 关闭文本编辑器
function closeTextEditor() {
    const modal = document.getElementById('textEditorModal');
    modal.style.display = 'none';
    currentTextFile = null;
    document.getElementById('textEditorContent').value = '';
    document.getElementById('textEditorInfo').textContent = '';
}

// 键盘事件
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeImageModal();
        closeTextEditor();
    }
    
    // Ctrl+S 保存（在文本编辑器中保存文件，否则保存共享文本）
    if (event.ctrlKey && event.key === 's') {
        event.preventDefault();
        const textEditorModal = document.getElementById('textEditorModal');
        if (textEditorModal.style.display === 'block') {
            saveTextFile();
        } else {
            saveSharedText();
        }
    }
});

// ==================== 批量操作功能 ====================

// 切换文件选择状态
function toggleFileSelection(filename) {
    if (selectedFiles.has(filename)) {
        selectedFiles.delete(filename);
    } else {
        selectedFiles.add(filename);
    }
    updateBatchActions();
    displayFiles(currentFiles);
}

// 更新批量操作按钮显示
function updateBatchActions() {
    const batchActions = document.getElementById('batchActions');
    const selectedCount = document.getElementById('selectedCount');
    
    if (selectedFiles.size > 0) {
        batchActions.style.display = 'flex';
        selectedCount.textContent = `已选择 ${selectedFiles.size} 个文件`;
    } else {
        batchActions.style.display = 'none';
    }
}

// 全选/取消全选
function selectAllFiles() {
    if (selectedFiles.size === currentFiles.length) {
        selectedFiles.clear();
    } else {
        currentFiles.forEach(file => selectedFiles.add(file.name));
    }
    updateBatchActions();
    displayFiles(currentFiles);
}

// 批量下载
async function batchDownload() {
    if (selectedFiles.size === 0) {
        showToast('请先选择要下载的文件', 'error');
        return;
    }
    
    const files = Array.from(selectedFiles);
    showToast(`开始下载 ${files.length} 个文件...`, 'info');
    
    for (let i = 0; i < files.length; i++) {
        const filename = files[i];
        try {
            await downloadFile(filename);
            // 延迟一下避免浏览器阻止多个下载
            if (i < files.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } catch (error) {
            console.error(`下载 ${filename} 失败:`, error);
        }
    }
    
    showToast(`已开始下载 ${files.length} 个文件`, 'success');
}

// 批量删除
async function batchDelete() {
    if (selectedFiles.size === 0) {
        showToast('请先选择要删除的文件', 'error');
        return;
    }
    
    const files = Array.from(selectedFiles);
    const count = files.length;
    
    if (!confirm(`确定要删除选中的 ${count} 个文件吗？此操作不可恢复！`)) {
        return;
    }
    
    showToast(`正在删除 ${count} 个文件...`, 'info');
    
    const headers = {};
    if (accessPassword) {
        headers['x-access-password'] = accessPassword;
    }
    
    let successCount = 0;
    let failCount = 0;
    
    for (const filename of files) {
        try {
            const response = await fetch(`/api/delete/${filename}`, {
                method: 'DELETE',
                headers: headers
            });
            
            if (response.ok) {
                successCount++;
                selectedFiles.delete(filename);
            } else {
                failCount++;
            }
        } catch (error) {
            console.error(`删除 ${filename} 失败:`, error);
            failCount++;
        }
    }
    
    if (successCount > 0) {
        showToast(`成功删除 ${successCount} 个文件${failCount > 0 ? `，${failCount} 个失败` : ''}`, successCount === count ? 'success' : 'warning');
        if (accessPassword) {
            loadFilesWithPassword();
        } else {
            loadFiles();
        }
    } else {
        showToast('删除失败', 'error');
    }
    
    updateBatchActions();
}

