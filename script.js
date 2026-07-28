const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const previewRow = document.getElementById('previewRow');
const previewImg = document.getElementById('previewImg');
const metaOutput = document.getElementById('metaOutput');
const statsBar = document.getElementById('statsBar');
const copyBtn = document.getElementById('copyBtn');
const clearBtn = document.getElementById('clearBtn');
const downloadBtn = document.getElementById('downloadBtn');

let lastMeta = null;
let lastFileName = '';

// Клик по зоне
dropZone.addEventListener('click', () => fileInput.click());

// Drag & Drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#7aa9e6';
});
dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = '#3b4a5e';
});
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#3b4a5e';
    if (e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
    }
});

// Выбор через input
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFile(e.target.files[0]);
    }
});

function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const valid = ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'webp'];
    if (!valid.includes(ext)) {
        metaOutput.textContent = '❌ Неподдерживаемый формат. Загрузи .jpg/.jpeg/.png/.tiff/.webp';
        previewRow.style.display = 'none';
        fileName.textContent = 'Ошибка формата';
        return;
    }

    lastFileName = file.name;
    fileName.textContent = `📄 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;

    // Превью
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImg.src = e.target.result;
        previewRow.style.display = 'flex';
    };
    reader.readAsDataURL(file);

    // Извлечение метаданных через exifr
    exifr.parse(file, { mergeOutput: true, translateKeys: true })
        .then((meta) => {
            if (!meta || Object.keys(meta).length === 0) {
                metaOutput.textContent = '⚠️ Метаданные не найдены (или формат без EXIF)';
                statsBar.innerHTML = '<span>📭 Нет данных</span>';
                lastMeta = null;
                return;
            }
            lastMeta = meta;
            renderMeta(meta);
        })
        .catch((err) => {
            metaOutput.textContent = `❌ Ошибка чтения: ${err.message}`;
            statsBar.innerHTML = '<span>⚠️ Ошибка</span>';
            lastMeta = null;
        });
}

function renderMeta(meta) {
    // Статистика
    const keys = Object.keys(meta);
    const count = keys.length;
    const size = new Blob([JSON.stringify(meta)]).size;
    statsBar.innerHTML = `
        <span>🧩 Поля: ${count}</span>
        <span>📦 Размер мета: ${(size / 1024).toFixed(2)} KB</span>
        <span>📷 ${meta.Make || 'N/A'} ${meta.Model || ''}</span>
    `;

    // Форматированный вывод
    let output = '';
    const sorted = Object.keys(meta).sort();
    for (const key of sorted) {
        let val = meta[key];
        if (typeof val === 'object' && val !== null) {
            try {
                val = JSON.stringify(val, null, 2);
            } catch {
                val = String(val);
            }
        } else if (typeof val === 'string' && val.length > 200) {
            val = val.substring(0, 200) + '…';
        }
        output += `<span class="tag">${key}</span> : <span class="value">${val}</span>\n`;
    }
    metaOutput.innerHTML = output;
}

// Копировать
copyBtn.addEventListener('click', () => {
    if (!lastMeta) {
        metaOutput.textContent = '⚠️ Нет метаданных для копирования';
        return;
    }
    const text = JSON.stringify(lastMeta, null, 2);
    navigator.clipboard.writeText(text).then(() => {
        metaOutput.innerHTML = '✅ Скопировано в буфер обмена (JSON)\n' + metaOutput.innerHTML;
    }).catch(() => {
        // fallback
        const area = document.createElement('textarea');
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
        metaOutput.innerHTML = '✅ Скопировано (fallback)\n' + metaOutput.innerHTML;
    });
});

// Очистить
clearBtn.addEventListener('click', () => {
    lastMeta = null;
    previewRow.style.display = 'none';
    previewImg.src = '';
    metaOutput.textContent = 'Очищено. Загрузи новый файл.';
    statsBar.innerHTML = '';
    fileName.textContent = 'Файл не выбран';
    fileInput.value = '';
});

// Скачать JSON
downloadBtn.addEventListener('click', () => {
    if (!lastMeta) {
        metaOutput.textContent = '⚠️ Нет данных для скачивания';
        return;
    }
    const json = JSON.stringify(lastMeta, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = lastFileName.replace(/\.[^.]+$/, '') + '_metadata.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
});
