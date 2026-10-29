let imgObj = new Image();
let originalCanvas1 = document.getElementById('canvasOriginal1');
let ctx1 = originalCanvas1.getContext('2d');

let globalThreshold = 50;
let currentSegmentationMethod = null;

window.onload = () => {
    createTestImage();
};

document.getElementById('globalThreshold').addEventListener('input', (e) => {
    globalThreshold = parseInt(e.target.value);
    document.getElementById('thresholdVal').innerText = globalThreshold;

    if (currentSegmentationMethod === 'point') {
        applyPointDetection();
    } else if (currentSegmentationMethod === 'line') {
        applyLineDetection();
    } else if (currentSegmentationMethod === 'edge') {
        applyEdgeDetection();
    }
});

function createTestImage() {
    let canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;
    let c = canvas.getContext('2d');
    
    // Фон
    c.fillStyle = '#b0b0b0';
    c.fillRect(0, 0, 300, 300);

    // Геометрические фигуры
    c.fillStyle = '#ffffff';
    c.fillRect(50, 50, 80, 80);
    c.fillStyle = '#202020';
    c.fillRect(180, 50, 70, 70);

    // Линии
    c.strokeStyle = '#000000';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(20, 200); c.lineTo(280, 200);
    c.moveTo(50, 220); c.lineTo(250, 280);
    c.stroke();

    // Точки
    c.fillStyle = '#000000';
    for(let i=0; i<10; i++) {
        c.fillRect(Math.random()*260 + 20, Math.random()*40 + 150, 4, 4);
    }

    imgObj.src = canvas.toDataURL();
    imgObj.onload = () => {
        originalCanvas1.width = imgObj.width;
        originalCanvas1.height = imgObj.height;
        ctx1.drawImage(imgObj, 0, 0);
        refreshAllViews();
    };
}

document.getElementById('loadDefaultBtn').onclick = createTestImage;

document.getElementById('uploadImage').addEventListener('change', function(e) {
    let reader = new FileReader();
    reader.onload = function(event) {
        imgObj.src = event.target.result;
        imgObj.onload = () => {
            originalCanvas1.width = imgObj.width;
            originalCanvas1.height = imgObj.height;
            ctx1.drawImage(imgObj, 0, 0);
            refreshAllViews();
        }
    }
    reader.readAsDataURL(e.target.files[0]);
});

function refreshAllViews() {
    drawToCanvas('canvasResult1', ctx1.getImageData(0, 0, originalCanvas1.width, originalCanvas1.height));
    drawToCanvas('canvasOtsu', ctx1.getImageData(0, 0, originalCanvas1.width, originalCanvas1.height));
    drawToCanvas('canvasIter', ctx1.getImageData(0, 0, originalCanvas1.width, originalCanvas1.height));
}

function drawToCanvas(canvasId, imgData) {
    let canvas = document.getElementById(canvasId);
    canvas.width = imgData.width;
    canvas.height = imgData.height;
    let ctx = canvas.getContext('2d');
    ctx.putImageData(imgData, 0, 0);
}

function toGrayscale(imgData) {
    let d = imgData.data;
    let gray = new Float32Array(d.length / 4);
    for (let i = 0; i < d.length; i += 4) {
        gray[i / 4] = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
    }
    return gray;
}

function convolve(gray, width, height, kernel) {
    let output = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let sum = 0;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    let idx = (y + ky) * width + (x + kx);
                    sum += gray[idx] * kernel[ky + 1][kx + 1];
                }
            }
            output[y * width + x] = sum;
        }
    }
    return output;
}

// Сегментация: Обнаружение точек
function applyPointDetection() {
    currentSegmentationMethod = 'point';
    let imgData = ctx1.getImageData(0, 0, originalCanvas1.width, originalCanvas1.height);
    let w = imgData.width, h = imgData.height;
    let gray = toGrayscale(imgData);

    let kernel = [
        [-1, -1, -1],
        [-1,  8, -1],
        [-1, -1, -1]
    ];

    let res = convolve(gray, w, h, kernel);
    let threshold = 50;
    let outData = ctx1.createImageData(w, h);

    for (let i = 0; i < res.length; i++) {
        let val = Math.abs(res[i]) > globalThreshold ? 255 : 0;
        let idx = i * 4;
        outData.data[idx] = val;
        outData.data[idx+1] = val;
        outData.data[idx+2] = val;
        outData.data[idx+3] = 255;
    }
    drawToCanvas('canvasResult1', outData);
    document.getElementById('desc1').innerText = `Обнаружение точек. Порог T = ${globalThreshold}`;
}

// Сегментация: Обнаружение линий
function applyLineDetection() {
    currentSegmentationMethod = 'line';
    let imgData = ctx1.getImageData(0, 0, originalCanvas1.width, originalCanvas1.height);
    let w = imgData.width, h = imgData.height;
    let gray = toGrayscale(imgData);

    // 4 маски для обнаружения линий (горизонтальная, вертикальная, +45 градусов, -45 градусов)
    let kHoriz = [
        [-1, -1, -1],
        [ 2,  2,  2],
        [-1, -1, -1]
    ];
    let kVert = [
        [-1, 2, -1],
        [-1, 2, -1],
        [-1, 2, -1]
    ];
    let kDiag1 = [
        [ 2, -1, -1],
        [-1,  2, -1],
        [-1, -1,  2]
    ];
    let kDiag2 = [
        [-1, -1,  2],
        [-1,  2, -1],
        [ 2, -1, -1]
    ];

    // Отклики по направлениям
    let rH  = convolve(gray, w, h, kHoriz);
    let rV  = convolve(gray, w, h, kVert);
    let rD1 = convolve(gray, w, h, kDiag1);
    let rD2 = convolve(gray, w, h, kDiag2);

    let threshold = 60; // T
    let outData = ctx1.createImageData(w, h);

    for (let i = 0; i < gray.length; i++) {
        let mH  = Math.abs(rH[i]);
        let mV  = Math.abs(rV[i]);
        let mD1 = Math.abs(rD1[i]);
        let mD2 = Math.abs(rD2[i]);

        // Пиксель будем считать принадлежащим типу линии, отклик фильтра которого максимальный.
        let maxResp = Math.max(mH, mV, mD1, mD2);

        // Пороговая обработка.
        let val = maxResp > globalThreshold ? 255 : 0;
        let idx = i * 4;
        outData.data[idx]     = val;
        outData.data[idx + 1] = val;
        outData.data[idx + 2] = val;
        outData.data[idx + 3] = 255;
    }

    drawToCanvas('canvasResult1', outData);
    document.getElementById('desc1').innerText = `Обнаружение линий. Порог T = ${globalThreshold}`;
}

// Сегментация: Перепады яркости (градиент Собеля)
function applyEdgeDetection() {
    currentSegmentationMethod = 'edge';
    let imgData = ctx1.getImageData(0, 0, originalCanvas1.width, originalCanvas1.height);
    let w = imgData.width, h = imgData.height;
    let gray = toGrayscale(imgData);

    // Фильтры по направлениям.
    let kGx = [
        [-1, 0, 1],
        [-2, 0, 2],
        [-1, 0, 1]
    ];

    let kGy = [
        [-1, -2, -1],
        [0, 0, 0],
        [1, 2, 1]
    ];
    // Составляющие градиента по направлениям.
    let Gx = convolve(gray, w, h, kGx);
    let Gy = convolve(gray, w, h, kGy);

    let outData = ctx1.createImageData(w, h);
    for (let i = 0; i < gray.length; i++) {

        let grad = Math.abs(Gx[i]) + Math.abs(Gy[i]);
        let val = grad > globalThreshold ? 255 : 0;
        let idx = i * 4;
        outData.data[idx] = val;
        outData.data[idx+1] = val;
        outData.data[idx+2] = val;
        outData.data[idx+3] = 255;
    }
    drawToCanvas('canvasResult1', outData);
    document.getElementById('desc1').innerText = `Выделение границ (Собель). Порог T = ${globalThreshold}`;
}

// Сравнение глобальных пороговых методов
function compareThresholds() {
    let imgData = ctx1.getImageData(0, 0, originalCanvas1.width, originalCanvas1.height);
    let w = imgData.width, h = imgData.height;
    let gray = toGrayscale(imgData);

    // Гистограмма
    let hist = new Array(256).fill(0);
    for (let i = 0; i < gray.length; i++) {
        hist[Math.min(255, Math.max(0, Math.round(gray[i])))]++;
    }

    // Метод Отсу
    // S(T) = P1(T)*P2(T)*(M1(T)-M2(T))^2   
    let total = gray.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    
    let sumB = 0;
    let wB = 0;
    let maxVar = 0;
    let thresholdOtsu = 0;

    for (let t = 0; t < 256; t++) {
        wB += hist[t];
        sumB += t * hist[t];

        if (wB === 0) continue;
        let wF = total - wB;
        if (wF === 0) break;
        
        let mB = sumB / wB;
        let mF = (sum - sumB) / wF;
        let varCur = wB * wF * (mB - mF) * (mB - mF);
        if (varCur > maxVar) {
            maxVar = varCur;
            thresholdOtsu = t;
        }
    }

    // Итеративный метод
    let tIter = 128;
    for (let iter = 0; iter < 20; iter++) {
        let sum1 = 0, count1 = 0, sum2 = 0, count2 = 0;
        for (let i = 0; i < gray.length; i++) {
            if (gray[i] > tIter) { sum1 += gray[i]; count1++; }
            else { sum2 += gray[i]; count2++; }
        }
        let m1 = count1 > 0 ? sum1 / count1 : 0;
        let m2 = count2 > 0 ? sum2 / count2 : 0;
        let newT = Math.round((m1 + m2) / 2);
        if (Math.abs(newT - tIter) < 1) break;
        tIter = newT;
    }

    let outOtsu = ctx1.createImageData(w, h);
    let outIter = ctx1.createImageData(w, h);

    for (let i = 0; i < gray.length; i++) {
        let valO = gray[i] > thresholdOtsu ? 255 : 0;
        let valI = gray[i] > tIter ? 255 : 0;
        let idx = i * 4;

        outOtsu.data[idx]   = valO; outOtsu.data[idx+1] = valO; outOtsu.data[idx+2] = valO; outOtsu.data[idx+3] = 255;
        outIter.data[idx]   = valI; outIter.data[idx+1] = valI; outIter.data[idx+2] = valI; outIter.data[idx+3] = 255;
    }

    drawToCanvas('canvasOtsu', outOtsu);
    drawToCanvas('canvasIter', outIter);

    document.getElementById('descOtsu').innerText = `Метод Отсу. Оптимальный порог: T = ${thresholdOtsu}.`;
    document.getElementById('descIter').innerText = `Итеративный метод. Найденный порог: T = ${tIter}.`;
}