// Current machine color 
let currentColor = { r: 60, g: 145, b: 235};

function rgbToCmyk(r, g, b) {
    let rc = r / 255, gc = g / 255, bc = b / 255;
    let k = 1 - Math.max(rc, gc, bc);

    if (k === 1) return {c: 0, m: 0, y: 0, k: 100};

    let c = (1 - rc - k)/(1 - k);
    let m = (1 - gc - k)/(1 - k);
    let y = (1 - bc - k)/(1 - k);

    return {
        c: Math.round(c * 100),
        m: Math.round(m * 100),
        y: Math.round(y * 100),
        k: Math.round(k * 100)
    };
}

function cmykToRgb(c, m, y, k) {
    c = c / 100, m = m / 100, y = y / 100, k = k / 100;
    let r = 255 * (1 - c) * (1 - k);
    let g = 255 * (1 - m) * (1 - k);
    let b = 255 * (1 - y) * (1 - k);
    return {
        r: Math.round(r),
        g: Math.round(g),
        b: Math.round(b)
    };
}

function hlsToRgb(h, l, s) {
    h /= 360; l /= 100; s /= 100;
    let r, g, b;

    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (h, m1, m2) => {
            if (h < 0) h += 1;
            if (h > 1) h -= 1;
            if (h < 1/6) return m1 + (m2 - m1) * 6 * h;
            if (h < 1/2) return m2;
            if (h < 2/3) return m1 + (m2 - m1) * (2/3 - h) * 6;
            return m1;
        };
        let m2 = l < 0.5 ? l * (1 + s) : l + s - l*s;
        let m1 = 2*l - m2;
        r = hue2rgb(h + 1/3, m1, m2);
        g = hue2rgb(h,       m1, m2);
        b = hue2rgb(h - 1/3, m1, m2);
    }
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

function rgbToHls(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    let max = Math.max(r, g, b);
    let min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // achromatic;
    } else {
        let d = max - min;
        s = l>0.5 ? d/(2-max-min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return {
        h: Math.round(h * 360),
        l: Math.round(l * 100),
        s: Math.round(s * 100)
    };
}

function updateUI(sourceModel) {
    let cmyk = rgbToCmyk(currentColor.r, currentColor.g, currentColor.b);
    let hls  = rgbToHls(currentColor.r, currentColor.g, currentColor.b);

    // Same vars as data-model in index.html
    let values = {
        rgb: currentColor,
        cmyk: cmyk,
        hls: hls
    };

    // Select all <input> elements in doc which have 
    // data-model attribute and apply assignment of values.
    document.querySelectorAll("input[data-model]").forEach(input => {
            let model = input.dataset.model;
            let prop = input.dataset.prop;
            if (model !== sourceModel) {
                input.value = values[model][prop];
            }
    });

    // Update colorBox background style with new color.
    document.getElementById('colorBox').style.background = 
    `rgb(${currentColor.r}, ${currentColor.g}, ${currentColor.b})`;

    // Update colorPalette internal hex value.
    let hex = "#" + ((1 << 24) + (currentColor.r << 16) + (currentColor.g << 8) + (currentColor.b)).toString(16).slice(1);
        document.getElementById('colorPalette').value = hex;
}

// Add listeners to all range- and number-inputs.
document.querySelectorAll('input[data-model]').forEach(input => {
    input.addEventListener('input', (e) => {
        let model = e.target.dataset.model;
        let prop = e.target.dataset.prop;
        let val = parseInt(e.target.value) || 0;

        // Sync range- and corresponding number- inputs.
        let card = e.target.closest('.model-card');
        card.querySelectorAll(`input[data-prop="${prop}"]`).forEach(
            el => {
                el.value = Math.max(el.min, Math.min(el.max, val));
            }
        )

        // Select current model values, which is being selected.
        let inputs = card.querySelectorAll('input[type="number"]');
        let data = {};
        inputs.forEach(inp => {
            data[inp.dataset.prop] = Math.max(inp.min, Math.min(inp.max, 
                parseInt(inp.value) || 0
            ));
        })

        if (model === 'rgb') {
            currentColor = { r: data.r, g: data.g, b: data.b };
        } else if (model === 'cmyk') {
            currentColor = cmykToRgb(data.c, data.m, data.y, data.k);
        } else if (model === 'hls') {
            currentColor = hlsToRgb(data.h, data.l, data.s);
        }

        updateUI(model);
    });
});

// Add listener to the palette.
document.getElementById('colorPalette').addEventListener('input', (e) => {
    let hex = e.target.value;
    let r = parseInt(hex.substr(1, 2), 16);
    let g = parseInt(hex.substr(3, 2), 16);
    let b = parseInt(hex.substr(5, 2), 16);
    currentColor = {r, g, b};

    updateUI('palette'); // Will update all models.
});

updateUI('init'); // Will update and sync all models.
