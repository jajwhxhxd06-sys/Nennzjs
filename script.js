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

dropZone.addEventListener('click', () => fileInput.click());

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

    // === ГЛАВНОЕ: парсинг с расширенными опциями для PNG ===
    const options = {
        mergeOutput: true,
        translateKeys: true,
        // Принудительно читаем все текстовые блоки PNG
        tiff: true,          // для EXIF внутри PNG (редко)
        exif: true,
        iptc: true,
        xmp: true,
        // Специально для PNG: читаем текстовые чанки
        png: true,
        // Параметры для извлечения всех текстовых полей
        pick: ['*']          // берём всё, что найдётся
    };

    exifr.parse(file, options)
        .then((meta) => {
            if (!meta || Object.keys(meta).length === 0) {
                // Пробуем альтернативный метод — читаем только PNG-чанки
                return exifr.parse(file, { png: true, mergeOutput: true })
                    .then((pngMeta) => {
                        if (pngMeta && Object.keys(pngMeta).length > 0) {
                            renderMeta(pngMeta);
                        } else {
                            metaOutput.textContent = '⚠️ Метаданные не найдены (PNG без текстовых блоков)';
                            statsBar.innerHTML = '<span>📭 Нет данных</span>';
                            lastMeta = null;
                        }
                    });
            }
            renderMeta(meta);
        })
        .catch((err) => {
            // Фолбэк: пробуем прочитать PNG как бинарный и вытащить текстовые блоки вручную
            readPngTextChunks(file)
                .then((chunks) => {
                    if (chunks && Object.keys(chunks).length > 0) {
                        renderMeta(chunks);
                    } else {
                        metaOutput.textContent = `❌ Ошибка: ${err.message}`;
                        statsBar.innerHTML = '<span>⚠️ Ошибка</span>';
                        lastMeta = null;
                    }
                })
                .catch(() => {
                    metaOutput.textContent = `❌ Ошибка чтения: ${err.message}`;
                    statsBar.innerHTML = '<span>⚠️ Ошибка</span>';
                    lastMeta = null;
                });
        });
}

// === РУЧНОЙ ПАРСЕР PNG-ЧАНКОВ (на случай, если exifr не справился) ===
function readPngTextChunks(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const buffer = e.target.result;
                const view = new DataView(buffer);
                const result = {};

                // Проверяем сигнатуру PNG
                const signature = view.getUint32(0);
                if (signature !== 0x89504E47) {
                    reject(new Error('Не PNG файл'));
                    return;
                }

                let offset = 8; // после сигнатуры
                while (offset < view.byteLength) {
                    const chunkLength = view.getUint32(offset);
                    const chunkType = view.getUint32(offset + 4);
                    const chunkDataOffset = offset + 8;
                    const chunkEnd = chunkDataOffset + chunkLength + 4; // +4 для CRC

                    // Текстовые чанки: tEXt, zTXt, iTXt
                    const typeStr = intToStr(chunkType);
                    if (typeStr === 'tEXt' || typeStr === 'zTXt' || typeStr === 'iTXt') {
                        // Извлекаем ключ (до нулевого байта)
                        let key = '';
                        let i = 0;
                        while (i < chunkLength) {
                            const byte = view.getUint8(chunkDataOffset + i);
                            if (byte === 0) break;
                            key += String.fromCharCode(byte);
                            i++;
                        }
                        // Значение — всё после нулевого байта
                        let value = '';
                        let j = i + 1;
                        // Для zTXt пропускаем байт метода сжатия
                        if (typeStr === 'zTXt') j += 1;
                        // Для iTXt пропускаем флаги и язык
                        if (typeStr === 'iTXt') {
                            // пропускаем 2 байта флагов + 1 байт длины языка + сам язык
                            const langLen = view.getUint8(chunkDataOffset + i + 2);
                            j = i + 3 + langLen + 1; // +1 для разделителя
                        }
                        while (j < chunkLength) {
                            const byte = view.getUint8(chunkDataOffset + j);
                            if (byte === 0) break;
                            value += String.fromCharCode(byte);
                            j++;
                        }
                        if (key) {
                            result[key] = value || '(пусто)';
                        }
                    }

                    offset = chunkEnd;
                    if (offset >= view.byteLength) break;
                }

                resolve(result);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('Ошибка чтения файла'));
        reader.readAsArrayBuffer(file);
    });
}

function intToStr(num) {
    return String.fromCharCode(
        (num >> 24) & 0xFF,
        (num >> 16) & 0xFF,
        (num >> 8) & 0xFF,
        num & 0xFF
    );
}

function renderMeta(meta) {
    lastMeta = meta;
    const keys = Object.keys(meta);
    const count = keys.length;
    const size = new Blob([JSON.stringify(meta)]).size;
    statsBar.innerHTML = `
        <span>🧩 Поля: ${count}</span>
        <span>📦 Размер мета: ${(size / 1024).toFixed(2)} KB</span>
        <span>📷 ${meta.Make || meta.Software || meta.Author || 'PNG'}</span>
    `;

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
        } else if (typeof val === 'string' && val.length > 300) {
            val = val.substring(0, 300) + '…';
        }
        output += `<span class="tag">${key}</span> : <span class="value">${val}</span>\n`;
    }
    metaOutput.innerHTML = output || '⚠️ Метаданные найдены, но пустые';
}

copyBtn.addEventListener('click', () => {
    if (!lastMeta) {
        metaOutput.textContent = '⚠️ Нет метаданных для копирования';
        return;
    }
    const text = JSON.stringify(lastMeta, null, 2);
    navigator.clipboard.writeText(text).then(() => {
        metaOutput.innerHTML = '✅ Скопировано в буфер обмена (JSON)\n' + metaOutput.innerHTML;
    }).catch(() => {
        const area = document.createElement('textarea');
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
        metaOutput.innerHTML = '✅ Скопировано (fallback)\n' + metaOutput.innerHTML;
    });
});

clearBtn.addEventListener('click', () => {
    lastMeta = null;
    previewRow.style.display = 'none';
    previewImg.src = '';
    metaOutput.textContent = 'Очищено. Загрузи новый файл.';
    statsBar.innerHTML = '';
    fileName.textContent = 'Файл не выбран';
    fileInput.value = '';
});

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
