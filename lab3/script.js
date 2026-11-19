document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('rasterCanvas');
    const ctx = canvas.getContext('2d');

    const algorithmSelect = document.getElementById('algorithmSelect');
    const lineParams = document.getElementById('lineParams');
    const circleParams = document.getElementById('circleParams');
    const gridScaleRange = document.getElementById('gridScale');
    const scaleValueSpan = document.getElementById('scaleValue');
    const drawBtn = document.getElementById('drawBtn');
    const execTimeSpan = document.getElementById('execTime');
    const pixelCountSpan = document.getElementById('pixelCount');
    const computationLog = document.getElementById('computationLog');

    let cellSize = parseInt(gridScaleRange.value);

    function resizeCanvas() {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
        redrawCanvas();
    }

    window.addEventListener('resize', resizeCanvas);

    algorithmSelect.addEventListener('change', () => {
        if (algorithmSelect.value === 'bresenham-circle') {
            lineParams.style.display = 'none';
            circleParams.style.display = 'flex';
        } else {
            lineParams.style.display = 'flex';
            circleParams.style.display = 'none';
        }
    });

    gridScaleRange.addEventListener('input', (e) => {
        cellSize = parseInt(e.target.value);
        scaleValueSpan.textContent = cellSize;
        redrawCanvas();
    });

    let lastExecutionData = null;
    let lastRealLine = null;

    drawBtn.addEventListener('click', () => {
        runSelectedAlgorithm();
    });

    // Draw the grid
    function drawGrid() {
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        const cols = Math.floor(width / cellSize);
        const rows = Math.floor(height / cellSize);

        const originX = Math.floor(cols / 4) * cellSize;
        const originY = Math.floor(rows * 3 / 4) * cellSize;

        // Draw grid lines
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;

        for (let x = 0; x <= width; x += cellSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        for (let y = 0; y <= height; y += cellSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2;

        // Ox
        ctx.beginPath();
        ctx.moveTo(0, originY);
        ctx.lineTo(width, originY);
        ctx.stroke();

        // Oy
        ctx.beginPath();
        ctx.moveTo(originX, 0);
        ctx.lineTo(originX, height);
        ctx.stroke();

        // подписи осей и шкалы
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px sans-serif';

        for (let x = 0; x <= width; x += cellSize) {
            const gridX = Math.round((x - originX) / cellSize);
            if (gridX !== 0 && gridX % 2 === 0) {
                ctx.fillText(gridX, x - 6, originY + 14);
            }
        }

        for (let y = 0; y <= height; y += cellSize) {
            const gridY = Math.round((originY - y) / cellSize);
            if (gridY !== 0 && gridY % 2 === 0) {
                ctx.fillText(gridY, originX + 6, y + 4);
            }
        }

        return { originX, originY };
    }

    function drawPixel(gridX, gridY, originX, originY,
                      color = '#3b82f6', alpha = 1.0) {
        const screenX = originX + gridX * cellSize;
        const screenY = originY - gridY * cellSize;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.fillRect(
            screenX + 1,
            screenY - cellSize + 1,
            cellSize - 2,
            cellSize - 2
        );
        ctx.restore();
    }

    // Перерисовка: сетка -> растровые пиксели -> красная линия
    function redrawCanvas() {
        const { originX, originY } = drawGrid();

        if (lastExecutionData) {
            renderPixels(lastExecutionData, originX, originY);
        }

        if (lastRealLine) {
            drawRealLine(lastRealLine, originX, originY);
        }
    }

    // Отрисовка идеального математического отрезка поверх всего.
    // Смещение на 0.5 экранного пикселя.
    function drawRealLine(line, originX, originY) {
        const screenX1 = originX + (line.x1 + 0.5) * cellSize;
        const screenY1 = originY - (line.y1 + 0.5) * cellSize;
        const screenX2 = originX + (line.x2 + 0.5) * cellSize;
        const screenY2 = originY - (line.y2 + 0.5) * cellSize;

        ctx.save();
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(screenX1, screenY1);
        ctx.lineTo(screenX2, screenY2);
        ctx.stroke();
        ctx.restore();
    }

    function renderPixels(pixels, originX, originY) {
        pixels.forEach(p => {
            drawPixel(
                p.x,
                p.y,
                originX,
                originY,
                p.color || '#3b82f6',
                p.alpha !== undefined ? p.alpha : 1.0
            );
        });
    }

    function runSelectedAlgorithm() {
        const alg = algorithmSelect.value;
        const { originX, originY } = drawGrid();

        let pixels = [];
        let logs = [];
        let startTime = performance.now();
        lastRealLine = null;

        if (alg === 'bresenham-circle') {
            const cx = parseInt(document.getElementById('cx').value);
            const cy = parseInt(document.getElementById('cy').value);
            const r = parseInt(document.getElementById('radius').value);

            const result = bresenhamCircle(cx, cy, r);
            pixels = result.pixels;
            logs = result.logs;
        } else {
            const x1 = parseInt(document.getElementById('x1').value);
            const y1 = parseInt(document.getElementById('y1').value);
            const x2 = parseInt(document.getElementById('x2').value);
            const y2 = parseInt(document.getElementById('y2').value);

            lastRealLine = { x1, y1, x2, y2 };

            if (alg === 'stepwise') {
                const result = stepwiseLine(x1, y1, x2, y2);
                pixels = result.pixels;
                logs = result.logs;
            }
            else if (alg === 'dda') {
                const result = ddaLine(x1, y1, x2, y2);
                pixels = result.pixels;
                logs = result.logs;
            }
            else if (alg === 'bresenham-line') {
                const result = bresenhamLine(x1, y1, x2, y2);
                pixels = result.pixels;
                logs = result.logs;
            }
            else if (alg === 'castle-pitway') {
                const result = castlePitwayLine(x1, y1, x2, y2);
                pixels = result.pixels;
                logs = result.logs;
            }
            else if (alg === 'wu-line') {
                const result = wuLine(x1, y1, x2, y2);
                pixels = result.pixels;
                logs = result.logs;
            }
        }

        let endTime = performance.now();
        let duration = (endTime - startTime).toFixed(3);

        execTimeSpan.textContent = duration;
        pixelCountSpan.textContent = pixels.length;
        computationLog.textContent = logs.join('\n');

        lastExecutionData = pixels;

        // Сначала растровые пиксели
        renderPixels(pixels, originX, originY);

        // Красная математическая линия поверх растра
        if (lastRealLine) {
            drawRealLine(lastRealLine, originX, originY);
        }
    }

    // Пошаговый алгоритм
    function stepwiseLine(x1, y1, x2, y2) {
        let pixels = [];
        let logs = [
            `[Пошаговый алгоритм] Отрезок: (${x1}, ${y1}) -> (${x2}, ${y2})`
        ];

        let dx = x2 - x1;
        let dy = y2 - y1;

        if (dx === 0) {
            let yStart = Math.min(y1, y2);
            let yEnd = Math.max(y1, y2);

            for (let y = yStart; y <= yEnd; y++) {
                pixels.push({ x: x1, y: y });
                logs.push(`X = ${x1}, Y = ${y}`);
            }

            return { pixels, logs };
        }

        let k = dy / dx;
        let b = y1 - k * x1;

        logs.push(`Коэффициент k = ${k.toFixed(3)}, b = ${b.toFixed(3)}`);

        let xStep = x1 <= x2 ? 1 : -1;
        let x = x1;

        while ((xStep > 0 && x <= x2) || (xStep < 0 && x >= x2)) {
            let yFloat = k * x + b;
            let yRounded = Math.round(yFloat);

            pixels.push({ x: x, y: yRounded });
            logs.push(
                `X = ${x}, Y_exact = ${yFloat.toFixed(2)} -> Y_round = ${yRounded}`
            );

            x += xStep;
        }

        return { pixels, logs };
    }

    // Алгоритм ЦДА
    function ddaLine(x1, y1, x2, y2) {
        let pixels = [];
        let logs = [`[Алгоритм ЦДА] Отрезок: (${x1}, ${y1}) -> (${x2}, ${y2})`];

        let dx = x2 - x1;
        let dy = y2 - y1;
        let steps = Math.max(Math.abs(dx), Math.abs(dy));

        logs.push(`Шагов (L) = ${steps}`);

        let xInc = dx / steps;
        let yInc = dy / steps;

        let x = x1;
        let y = y1;

        for (let i = 0; i <= steps; i++) {
            let rx = Math.round(x);
            let ry = Math.round(y);

            pixels.push({ x: rx, y: ry });
            logs.push(
                `Шаг ${i}: X = ${x.toFixed(2)} (${rx}), Y = ${y.toFixed(2)} (${ry})`
            );

            x += xInc;
            y += yInc;
        }

        return { pixels, logs };
    }

    // Алгоритм Брезенхема (отрезок, целочисленный)
    function bresenhamLine(x1, y1, x2, y2) {
        let pixels = [];
        let logs = [
            `[Целочисленный Брезенхем] Отрезок: (${x1}, ${y1}) -> (${x2}, ${y2})`
        ];

        let x = x1;
        let y = y1;

        let dx = Math.abs(x1 - x2);
        let dy = Math.abs(y1 - y2);

        let sx = (x1 < x2) ? 1 : -1;
        let sy = (y1 < y2) ? 1 : -1;

        let isSteep = dy > dx;

        if (isSteep) {
            [dx, dy] = [dy, dx];
        }

        // теперь после преобразований мы "решаем задачу в первом октанте".

        let e = 2 * dy - dx;

        logs.push(`|Dx| = ${dx}, |Dy| = ${dy}`);
        logs.push(`Начальная ошибка E' = 2*Dy - Dx = ${e}`);

        pixels.push({ x: x, y: y });
        logs.push(`Шаг 0: (${x}, ${y}), E' = ${e}`);

        for (let i = 1; i <= dx; i++) {
            if (e >= 0) {
                if (isSteep) {
                    x += sx;
                } else {
                    y += sy;
                }

                e = e + 2 * (dy - dx);
            } else {
                e = e + 2 * dy;
            }

            if (isSteep) {
                y += sy;
            } else {
                x += sx;
            }

            pixels.push({ x: x, y: y });
            logs.push(`Шаг ${i}: (${x}, ${y}), E' = ${e}`);
        }

        return { pixels, logs };
    }

    // Алгоритм Кастла-Питвея
    function castlePitwayLine(x1, y1, x2, y2) {
        let pixels = [];
        let logs = [
            `[Алгоритм Кастла-Питвея] Отрезок: (${x1}, ${y1}) -> (${x2}, ${y2})`
        ];

        let dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
        let sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
        let steep = dy > dx;
        let major = Math.max(dx, dy), minor = Math.min(dx, dy);

        if (major === 0) {
            pixels.push({ x: x1, y: y1 });
            logs.push('Отрезок вырожден в точку.');
            return { pixels, logs };
        }

        let remainder = 0, x = x1, y = y1;
        pixels.push({ x, y });
        let pattern = '';

        for (let i = 0; i < major; i++) {
            remainder += minor;
            let diagonal = remainder >= major;

            if (diagonal) remainder -= major;

            pattern += diagonal ? 'd' : 's';

            if (steep) {
                y += sy;
                if (diagonal) x += sx;
            } else {
                x += sx;
                if (diagonal) y += sy;
            }

            pixels.push({ x, y });
        }

        logs.push(`|Dx| = ${dx}, |Dy| = ${dy}, главная ось = ${steep ? 'Y' : 'X'}`);
        logs.push(`Код последовательности s/d: ${pattern}`);
        logs.push('s — шаг вдоль главной оси, d — диагональный шаг; получена 8-связная линия.');

        return { pixels, logs };
    }

    // Алгоритм Ву (сглаживание отрезка)
    function wuLine(x1, y1, x2, y2) {
        let pixels = [];
        let logs = [
            `[Алгоритм Ву (сглаживание)] Отрезок: (${x1}, ${y1}) -> (${x2}, ${y2})`
        ];

        const plot = (x, y, alpha) => {
            const old = pixels.find(p => p.x === x && p.y === y);

            if (old) {
                old.alpha = Math.min(1, old.alpha + alpha);
            } else {
                pixels.push({
                    x,
                    y,
                    alpha: Math.max(0, Math.min(1, alpha))
                });
            }
        };

        let dx = x2 - x1, dy = y2 - y1;

        if (dx === 0 && dy === 0) {
            pixels.push({ x: x1, y: y1, alpha: 1 });
            return { pixels, logs };
        }

        let steep = Math.abs(dy) > Math.abs(dx);

        if (steep) {
            [x1, y1] = [y1, x1];
            [x2, y2] = [y2, x2];
        }

        if (x1 > x2) {
            [x1, x2] = [x2, x1];
            [y1, y2] = [y2, y1];
        }

        dx = x2 - x1;
        dy = y2 - y1;

        const gradient = dx === 0 ? 0 : dy / dx;
        let y = y1;

        for (let x = Math.round(x1); x <= Math.round(x2); x++) {
            const baseY = Math.floor(y), frac = y - baseY;
            const a1 = 1 - frac, a2 = frac;

            if (steep) {
                plot(baseY, x, a1);
                plot(baseY + 1, x, a2);
            } else {
                plot(x, baseY, a1);
                plot(x, baseY + 1, a2);
            }

            logs.push(
                `X = ${x}, Y = ${y.toFixed(3)}: интенсивности ${a1.toFixed(3)} / ${a2.toFixed(3)}`
            );

            y += gradient;
        }

        return { pixels, logs };
    }

    // Алгоритм Брезенхема (окружность)
    function bresenhamCircle(xc, yc, r) {
        let pixels = [];
        let logs = [];

        logs.push(
            `[Брезенхем: Окружность] Центр: (${xc}, ${yc}), Радиус R = ${r}`
        );

        let x = 0;
        let y = r;
        let e = 3 - 2 * r;

        const plotSymmetric = (cx, cy, px, py) => {
            const points = [
                { x: cx + px, y: cy + py },
                { x: cx - px, y: cy + py },
                { x: cx + px, y: cy - py },
                { x: cx - px, y: cy - py },
                { x: cx + py, y: cy + px },
                { x: cx - py, y: cy + px },
                { x: cx + py, y: cy - px },
                { x: cx - py, y: cy - px }
            ];

            points.forEach(p => {
                if (!pixels.some(existing =>
                    existing.x === p.x && existing.y === p.y
                )) {
                    pixels.push(p);
                }
            });
        };

        plotSymmetric(xc, yc, x, y);
        logs.push(`X = ${x + xc}, Y = ${y + yc}, E = ${e}`);

        while (x < y) {
            x++;

            if (e >= 0) {
                y--;
                e = e + 4 * (x - y) + 10;
            } else {
                e = e + 4 * x + 6;
            }

            plotSymmetric(xc, yc, x, y);

            let rx = x + xc;
            let ry = y + yc;

            logs.push(`X = ${rx}, Y = ${ry}, E = ${e}`);
        }

        return { pixels, logs };
    }

    // initialization after launch
    resizeCanvas();
});