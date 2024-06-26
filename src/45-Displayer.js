// Display the XY-plane projection of a GCode toolpath on a 2D canvas

const root = window;

let canvas;
let tp;
const initDisplayer = () => {
    canvas = id("toolpath");
    canvas.addEventListener("mouseup", updateGcodeViewerAngle);

    tp = canvas.getContext("2d", { willReadFrequently: true });
    tp.lineWidth = 0.1;
    tp.lineCap = 'round';
    tp.strokeStyle = 'blue';
}
let tpRect;

let cameraAngle = 0;

let haveBoundary = true;

let xMaxTravel = 1000;
let yMaxTravel = 1000;

let xHomePos = 0;
let yHomePos = 0;

let xHomeDir = 1;
let yHomeDir = 1;

let tpUnits = 'G21';

let tpBbox = {
    min: {
        x: Infinity,
        y: Infinity
    },
    max: {
        x: -Infinity,
        y: -Infinity
    }
};
let bboxIsSet = false;

const resetBbox = () => {
    tpBbox.min.x = Infinity;
    tpBbox.min.y = Infinity;
    tpBbox.max.x = -Infinity;
    tpBbox.max.y = -Infinity;
    bboxIsSet = false;
}

// Project the 3D toolpath onto the 2D Canvas
// The coefficients determine the type of projection
// Matrix multiplication written out
let xx = 0.707;
let xy = 0.707;
let xz = 0.0;
let yx = -0.707 / 2;
let yy = 0.707 / 2;
let yz = 1.0;
const isoView = () => {
    xx = 0.707;
    xy = 0.707;
    xz = 0.0;
    yx = -0.707;
    yy = 0.707;
    yz = 1.0;
}
const obliqueView = () => {
    xx = 0.707;
    xy = 0.707;
    xz = 0.0;
    yx = -0.707 / 2;
    yy = 0.707 / 2;
    yz = 1.0;
}
const topView = () => {
    xx = 1.0;
    xy = 0.0;
    xz = 0.0;
    yx = 0.0;
    yy = 1.0;
    yz = 0.0;
}
const projection = (wpos) => {
    return { x: wpos.x * xx + wpos.y * xy + wpos.z * xz,
             y: wpos.x * yx + wpos.y * yy + wpos.z * yz
    }
}

const formatLimit = (mm) => {
    return (tpUnits == 'G20') ? (mm / 25.4).toFixed(3) + '"' : mm.toFixed(2) + 'mm';
}

let toolX = null;
let toolY = null;
let toolSave = null;
const toolRadius = 6;
const toolRectWH = toolRadius * 2 + 4;  // Slop to encompass the entire image area

const drawTool = (dpos) => {
    const pp = projection(dpos)
    toolX = xToPixel(pp.x) - toolRadius - 2;
    toolY = yToPixel(pp.y) - toolRadius - 2;
    toolSave = tp.getImageData(toolX, toolY, toolRectWH, toolRectWH);

    tp.beginPath();
    tp.strokeStyle = 'magenta';
    tp.fillStyle = 'magenta';
    tp.arc(pp.x, pp.y, toolRadius / scaler, 0, Math.PI * 2, true);
    tp.fill();
    tp.stroke();
}

const drawOrigin = (radius) => {
    const po = projection({ x: 0.0, y: 0.0, z: 0.0 })
    tp.beginPath();
    tp.strokeStyle = 'red';
    tp.arc(po.x, po.y, radius, 0, Math.PI * 2, false);
    tp.moveTo(-radius * 1.5, 0);
    tp.lineTo(radius * 1.5, 0);
    tp.moveTo(0, -radius * 1.5);
    tp.lineTo(0, radius * 1.5);
    tp.stroke();
}

const drawMachineBounds = () => {
    if (!haveBoundary) {
        return;
    }

    const wcoX = MPOS[0] - WPOS[0];
    const wcoY = MPOS[1] - WPOS[1];

    const xMin = (xHomeDir == 1) ? xHomePos - xMaxTravel : xHomePos;
    const yMin = (yHomeDir == 1) ? yHomePos - yMaxTravel : yHomePos;

    const xMax = xMin + xMaxTravel;
    const yMax = yMin + yMaxTravel;

    const p0 = projection({ x: xMin - wcoX, y: yMin - wcoY, z: 0 });
    const p1 = projection({ x: xMin - wcoX, y: yMax - wcoY, z: 0 });
    const p2 = projection({ x: xMax - wcoX, y: yMax - wcoY, z: 0 });
    const p3 = projection({ x: xMax - wcoX, y: yMin - wcoY, z: 0 });

    tpBbox.min.x = Math.min(tpBbox.min.x, p0.x, p1.x);
    tpBbox.min.y = Math.min(tpBbox.min.y, p0.y, p3.y);
    tpBbox.max.x = Math.max(tpBbox.max.x, p2.x, p3.x);
    tpBbox.max.y = Math.max(tpBbox.max.y, p1.y, p2.y);
    bboxIsSet = true;

    tp.beginPath();
    tp.moveTo(p0.x, p0.y);
    tp.lineTo(p1.x, p1.y);
    tp.lineTo(p2.x, p2.y);
    tp.lineTo(p3.x, p3.y);
    tp.lineTo(p0.x, p0.y);
    tp.strokeStyle = "green";
    tp.stroke();

}

let xOffset = 0;
let yOffset = 0;
let scaler = 1;
const xToPixel = (x) => { return scaler * x + xOffset; }
const yToPixel = (y) => { return -scaler * y + yOffset; }

const clearCanvas = () => {
    // Reset the transform and clear the canvas
    tp.setTransform(1, 0, 0, 1, 0, 0);

    //    if (tpRect == undefined) {
    let tpRect = canvas.parentNode.getBoundingClientRect();
    canvas.width = tpRect.width ? tpRect.width : 400;
    canvas.height = tpRect.height ? tpRect.height : 400;
    //    }

    tp.fillStyle = "white";
    tp.fillRect(0, 0, canvas.width, canvas.height);
}

const transformCanvas = () => {
    toolSave = null;

    clearCanvas();

    let imageWidth;
    let imageHeight;
    let inset;
    if (!bboxIsSet) {
        // imageWidth = canvas.width;
        // imageHeight = canvas.height;
        inset = 0;
        scaler = 1;
        xOffset = 0;
        yOffset = 0;
        return;
    }

    imageWidth = tpBbox.max.x - tpBbox.min.x;
    imageHeight = tpBbox.max.y - tpBbox.min.y;
    if (imageWidth == 0) {
        imageWidth = 1;
    }
    if (imageHeight == 0) {
        imageHeight = 1;
    }
    const shrink = 0.90;
    inset = 30;
    const scaleX = (canvas.width - inset * 2) / imageWidth;
    const scaleY = (canvas.height - inset * 2) / imageHeight;
    const minScale = Math.min(scaleX, scaleY);

    scaler = minScale * shrink;
    if (scaler < 0) {
        scaler = -scaler;
    }
    xOffset = inset - tpBbox.min.x * scaler;
    yOffset = (canvas.height - inset) - tpBbox.min.y * (-scaler);

    // Canvas coordinates of image bounding box top and right
    const imageTop = scaler * imageHeight;
    const imageRight = scaler * imageWidth;

    // Show the X and Y limit coordinates of the GCode program.
    // We do this before scaling because after we invert the Y coordinate,
    // text would be displayed upside-down.
    // tp.fillStyle = "black";
    // tp.font = "14px Ariel";
    // tp.textAlign = "center";
    // tp.textBaseline = "bottom";
    // tp.fillText(formatLimit(tpBbox.min.y), imageRight/2, canvas.height-inset);
    // tp.textBaseline = "top";
    // tp.fillText(formatLimit(tpBbox.max.y), imageRight/2, canvas.height-inset - imageTop);
    // tp.textAlign = "left";
    // tp.textBaseline = "center";
    // tp.fillText(formatLimit(tpBbox.min.x), inset, canvas.height-inset - imageTop/2);
    // tp.textAlign = "right";
    // tp.textBaseline = "center";
    // tp.fillText(formatLimit(tpBbox.max.x), inset+imageRight, canvas.height-inset - imageTop/2);
    // Transform the path coordinate system so the image fills the canvas
    // with a small inset, and +Y goes upward.
    // The net transform from image space (x,y) to pixel space (x',y') is:
    //   x' =  scaler*x + xOffset
    //   y' = -scaler*y + yOffset
    // We use setTransform() instead of a sequence of scale() and translate() calls
    // because we need to perform the transform manually for getImageData(), which
    // uses pixel coordinates, and there is no standard way to read back the current
    // transform matrix.

    tp.setTransform(scaler, 0, 0, -scaler, xOffset, yOffset);

    tp.lineWidth = 0.5 / scaler;

    drawOrigin(imageWidth * 0.04);
}
const wrappedDegrees = (radians) => {
    const degrees = radians * 180 / Math.PI;
    return degrees >= 0 ? degrees : degrees + 360;
}

const bboxHandlers = {
    addLine: (modal, start, end) => {
        // Update tpUnits in case it changed in a previous line
        tpUnits = modal.units;

        const ps = projection(start);
        const pe = projection(end);

        tpBbox.min.x = Math.min(tpBbox.min.x, ps.x, pe.x);
        tpBbox.min.y = Math.min(tpBbox.min.y, ps.y, pe.y);
        tpBbox.max.x = Math.max(tpBbox.max.x, ps.x, pe.x);
        tpBbox.max.y = Math.max(tpBbox.max.y, ps.y, pe.y);
        bboxIsSet = true;
    },
    addArcCurve: (modal, start, end, center, rotations) => {
        // To determine the precise bounding box of a circular arc we
        // must account for the possibility that the arc crosses one or
        // more axes.  If so, the bounding box includes the "bulges" of
        // the arc across those axes.

        // Update units in case it changed in a previous line
        tpUnits = modal.units;

        if (modal.motion == 'G2') {  // clockwise
            const tmp = start;
            start = end;
            end = tmp;
        }

        const ps = projection(start);
        const pc = projection(center);
        const pe = projection(end);

        // Coordinates relative to the center of the arc
        const sx = ps.x - pc.x;
        const sy = ps.y - pc.y;
        const ex = pe.x - pc.x;
        const ey = pe.y - pc.y;

        const radius = Math.hypot(sx, sy);

        // Axis crossings - plus and minus x and y
        let px = false;
        let py = false;
        let mx = false;
        let my = false;

        // There are ways to express this decision tree in fewer lines
        // of code by converting to alternate representations like angles,
        // but this way is probably the most computationally efficient.
        // It avoids any use of transcendental functions.  Every path
        // through this decision tree is either 4 or 5 simple comparisons.
        if (ey >= 0) {              // End in upper half plane
            if (ex > 0) {             // End in quadrant 0 - X+ Y+
                if (sy >= 0) {          // Start in upper half plane
                    if (sx > 0) {         // Start in quadrant 0 - X+ Y+
                        if (sx <= ex) {     // wraparound
                            px = py = mx = my = true;
                        }
                    } else {              // Start in quadrant 1 - X- Y+
                        mx = my = px = true;
                    }
                } else {                // Start in lower half plane
                    if (sx > 0) {         // Start in quadrant 3 - X+ Y-
                        px = true;
                    } else {              // Start in quadrant 2 - X- Y-
                        my = px = true;
                    }
                }
            } else {                  // End in quadrant 1 - X- Y+
                if (sy >= 0) {          // Start in upper half plane
                    if (sx > 0) {         // Start in quadrant 0 - X+ Y+
                        py = true;
                    } else {              // Start in quadrant 1 - X- Y+
                        if (sx <= ex) {     // wraparound
                            px = py = mx = my = true;
                        }
                    }
                } else {                // Start in lower half plane
                    if (sx > 0) {         // Start in quadrant 3 - X+ Y-
                        px = py = true;
                    } else {              // Start in quadrant 2 - X- Y-
                        my = px = py = true;
                    }
                }
            }
        } else {                    // ey < 0 - end in lower half plane
            if (ex > 0) {             // End in quadrant 3 - X+ Y+
                if (sy >= 0) {          // Start in upper half plane
                    if (sx > 0) {         // Start in quadrant 0 - X+ Y+
                        py = mx = my = true;
                    } else {              // Start in quadrant 1 - X- Y+
                        mx = my = true;
                    }
                } else {                // Start in lower half plane
                    if (sx > 0) {         // Start in quadrant 3 - X+ Y-
                        if (sx >= ex) {      // wraparound
                            px = py = mx = my = true;
                        }
                    } else {              // Start in quadrant 2 - X- Y-
                        my = true;
                    }
                }
            } else {                  // End in quadrant 2 - X- Y+
                if (sy >= 0) {          // Start in upper half plane
                    if (sx > 0) {         // Start in quadrant 0 - X+ Y+
                        py = mx = true;
                    } else {              // Start in quadrant 1 - X- Y+
                        mx = true;
                    }
                } else {                // Start in lower half plane
                    if (sx > 0) {         // Start in quadrant 3 - X+ Y-
                        px = py = mx = true;
                    } else {              // Start in quadrant 2 - X- Y-
                        if (sx >= ex) {      // wraparound
                            px = py = mx = my = true;
                        }
                    }
                }
            }
        }
        const maxX = px ? pc.x + radius : Math.max(ps.x, pe.x);
        const maxY = py ? pc.y + radius : Math.max(ps.y, pe.y);
        const minX = mx ? pc.x - radius : Math.min(ps.x, pe.x);
        const minY = my ? pc.y - radius : Math.min(ps.y, pe.y);

        const minZ = Math.min(start.z, end.z);
        const maxZ = Math.max(start.z, end.z);

        const p0 = projection({ x: minX, y: minY, z: minZ });
        const p1 = projection({ x: minX, y: maxY, z: minZ });
        const p2 = projection({ x: maxX, y: maxY, z: minZ });
        const p3 = projection({ x: maxX, y: minY, z: minZ });
        const p4 = projection({ x: minX, y: minY, z: maxZ });
        const p5 = projection({ x: minX, y: maxY, z: maxZ });
        const p6 = projection({ x: maxX, y: maxY, z: maxZ });
        const p7 = projection({ x: maxX, y: minY, z: maxZ });

        tpBbox.min.x = Math.min(tpBbox.min.x, p0.x, p1.x, p2.x, p3.x, p4.x, p5.x, p6.x, p7.x);
        tpBbox.min.y = Math.min(tpBbox.min.y, p0.y, p1.y, p2.y, p3.y, p4.y, p5.y, p6.y, p7.y);
        tpBbox.max.x = Math.max(tpBbox.max.x, p0.x, p1.x, p2.x, p3.x, p4.x, p5.x, p6.x, p7.x);
        tpBbox.max.y = Math.max(tpBbox.max.y, p0.y, p1.y, p2.y, p3.y, p4.y, p5.y, p6.y, p7.y);
        bboxIsSet = true;
    }
};
let initialMoves = true;
const displayHandlers = {
    addLine: (modal, start, end) => {
        const motion = modal.motion;
        if (motion == 'G0') {
            tp.strokeStyle = initialMoves ? 'red' : 'green';
        } else {
            tp.strokeStyle = 'blue';
            // Don't cancel initialMoves on no-motion G1 (e.g. G1 F30)
            // or on Z-only moves
            if (start.x != end.x || start.y != end.y) {
                initialMoves = false;
            }
        }

        const ps = projection(start);
        const pe = projection(end);
        tp.beginPath();
        // tp.moveTo(start.x, start.y);
        // tp.lineTo(end.x, end.y);
        tp.moveTo(ps.x, ps.y);
        tp.lineTo(pe.x, pe.y);
        tp.stroke();
    },
    addArcCurve: (modal, start, end, center, rotations) => {
        const motion = modal.motion;

        const deltaX1 = start.x - center.x;
        const deltaY1 = start.y - center.y;
        const radius = Math.hypot(deltaX1, deltaY1);
        const deltaX2 = end.x - center.x;
        const deltaY2 = end.y - center.y;
        let theta1 = Math.atan2(deltaY1, deltaX1);
        let theta2 = Math.atan2(deltaY2, deltaX2);
        const cw = modal.motion == "G2";
        if (!cw && theta2 < theta1) {
            theta2 += Math.PI * 2;
        } else if (cw && theta2 > theta1) {
            theta2 -= Math.PI * 2;
        }
        if (theta1 == theta2) {
            theta2 += Math.PI * ((cw) ? -2 : 2);
        }
        if (rotations > 1) {
            theta2 += (rotations - 1) * Math.PI * ((cw) ? -2 : 2);;
        }

        initialMoves = false;

        tp.beginPath();
        tp.strokeStyle = 'blue';
        const deltaTheta = theta2 - theta1;
        const n = 10 * Math.ceil(Math.abs(deltaTheta) / Math.PI);
        const dt = (deltaTheta) / n;
        const dz = (end.z - start.z) / n;
        const ps = projection(start);
        tp.moveTo(ps.x, ps.y);
        let next = {};
        let theta = theta1;
        next.z = start.z;
        for (let i = 0; i < n; i++) {
            theta += dt;
            next.x = center.x + radius * Math.cos(theta);
            next.y = center.y + radius * Math.sin(theta);
            next.z += dz;
            const pe = projection(next)
            tp.lineTo(pe.x, pe.y);
        }
        tp.stroke();
    },
};

// Arrow notation does not work here because arrow functions are not linked to an
// object prototype, hence the prototype assignments below will fail
class ToolpathDisplayer {
    clear = () => { clearCanvas(); }

    showToolpath = (gcode, modal, initialPosition) => {
        let drawBounds = false;
        switch (cameraAngle) {
        case 0:
            obliqueView();
            break;
        case 1:
            topView();
            break;
        case 2:
            obliqueView();
            drawBounds = true;
            break;
        case 3:
            topView();
            drawBounds = true;
            break;
        default:
            obliqueView();
        }

        resetBbox();
        bboxHandlers.position = initialPosition;
        bboxHandlers.modal = modal;

        if (drawBounds) {
            drawMachineBounds(); //Adds the machine bounds to the bounding box
        }

        const gcodeLines = gcode.split('\n');
        new Toolpath(bboxHandlers).loadFromLinesSync(gcodeLines);
        transformCanvas();
        if (!bboxIsSet) {
            return;
        }
        initialMoves = true;
        displayHandlers.position = initialPosition;
        displayHandlers.modal = modal;
        new Toolpath(displayHandlers).loadFromLinesSync(gcodeLines);
    
        drawTool(initialPosition);
        if (drawBounds) {
            drawMachineBounds();
        }
    }

    reDrawTool = (modal, dpos) => {
        if (toolSave != null) {
            tp.putImageData(toolSave, toolX, toolY);
            drawTool(dpos);
        }
    }

    disableBoundary = () => {
        haveBoundary = false;
    }

    setXTravel = (maxTravelX) => {
        xMaxTravel = maxTravelX;
    }
    setYTravel = (maxTravelY) => {
        yMaxTravel = maxTravelY;
    }
    setXHome = (xHomeInternal) => {
        xHomePos = xHomeInternal;
    }
    setYHome = (yHomeInternal) => {
        yHomePos = yHomeInternal;
    }
    setXDir = (xDir) => {
        xHomeDir = (xDir == "true") ? 1 : -1;
    }
    setYDir = (yDir) => {
        yHomeDir = (yDir == "true") ? 1 : -1;
    }
    cycleCameraAngle = (gcode, modal, position) => {
        cameraAngle = cameraAngle + 1;
        if (cameraAngle > 3) {
            cameraAngle = 0;
        }

        displayer.showToolpath(gcode, modal, position);
    }
}

const updateGcodeViewerAngle = () => {
    const gcode = id('gcode').value;
    displayer.cycleCameraAngle(gcode, modal, arrayToXYZ(WPOS));
}

const displayer = new ToolpathDisplayer();
