const EPS: number = 1e-6;
const DIS_TO_PANEL: number = 0.1;
const FAR_CLIPPING_PLANE: number = 10.0;
const FOV: number = Math.PI * 0.5;
const SCREEN_WIDTH = 300;

class Color {
    r: number;
    g: number;
    b: number;
    a: number;

    static red(): Color {
        return new Color(1, 0, 0, 1);
    }

    static green(): Color {
        return new Color(0, 1, 0, 1);
    }

    static blue(): Color {
        return new Color(0, 0, 1, 1);
    }

    static cyan(): Color {
        return new Color(0, 1, 1, 1);
    }

    static magenta(): Color {
        return new Color(1, 0, 1, 1);
    }

    constructor(r: number, g: number, b: number, a: number) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }

    brightness(factor: number): Color {
        return new Color(this.r*factor, this.g*factor, this.b*factor, this.a);
    }

    fillStyle(): string {
        return `rgba(${Math.floor(this.r*255)},`
              + `${Math.floor(this.g*255)},`
              + `${Math.floor(this.b*255)},`
              + `${Math.floor(this.a)})`;
    }
}

class Vector {
    x: number;
    y: number;

    static fromRadius(length: number, rad: number): Vector {
        return new Vector(length * Math.cos(rad), length * Math.sin(rad));
    }

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    array(): [number, number] {
        return [this.x, this.y];
    }

    add(that: Vector): Vector {
        return new Vector(this.x + that.x, this.y + that.y);
    }

    sub(that: Vector): Vector {
        return new Vector(this.x - that.x, this.y - that.y);
    }

    mul(that: Vector): Vector {
        return new Vector(this.x * that.x, this.y * that.y);
    }

    div(that: Vector): Vector {
        return new Vector(this.x / that.x, this.y / that.y);
    }

    dot(that: Vector): number {
        return this.x * that.x + this.y * that.y;
    }

    length(): number {
        return Math.sqrt(this.x**2 + this.y**2);
    }

    norm(): Vector {
        const v_len = this.length();
        return new Vector(this.x/v_len, this.y/v_len);
    }

    scale(factor: number): Vector { 
        return new Vector(this.x*factor, this.y*factor);
    }

    distanceTo(that: Vector): number {
        return that.sub(this).length();
    }

    rotate(rad: number): Vector {
        const theta: number = Math.atan2(this.y, this.x) + rad;
        const r: number = this.length();
        return new Vector(r*Math.cos(theta), r*Math.sin(theta));
    }

    lerp(that: Vector, factor: number): Vector {
        return this.add(that.sub(this).scale(factor));
    }
}

class Player {
    position: Vector;
    direction: Vector;

    constructor(pos: Vector, direct: Vector) {
        this.position = pos;
        this.direction = direct;
    }

    fovRange():[Vector, Vector] {
        const ray_len: number = DIS_TO_PANEL / Math.cos(FOV/2);
        const p1: Vector = this.position.add(this.direction.rotate(-1 * FOV/2).scale(ray_len));
        const p2: Vector = this.position.add(this.direction.rotate(FOV/2).scale(ray_len));
        return [p1, p2];
    }
}

type Scene = Array<Array<Color|null>>;

function snap(x: number, dx: number): number {
    if (dx > 0)
        return Math.ceil(x + Math.sign(dx)*EPS);
    if (dx < 0)
        return Math.floor(x + Math.sign(dx)*EPS);
    return x;
}

// y = k*x + d;
// x = (y - d)/k;
// y1 = k*x1 + d;
// y2 = k*x2 + d;
// y1 - k*x1 = d;
// y2 - y1 = k(x2 - x1);
//
// (y2 - y1)/(x2 - x1) = k;
// y1 - k*x1 = d;
function rayStep(p1: Vector, p2: Vector): Vector {
    const direct_norm: Vector = p2.sub(p1).norm();
    let p3: Vector = p2;
    if (direct_norm.x !== 0) {
        const slope: number = direct_norm.y / direct_norm.x;
        const c: number = p1.y - slope * p1.x;

        {
            const x3: number = snap(p2.x, direct_norm.x);
            const y3: number = slope*x3 + c;
            p3 = new Vector(x3, y3);
        }

        if (slope !== 0) {
            const y3 = snap(p2.y, direct_norm.y);
            const x3 = (y3 - c) / slope;
            const p3t = new Vector(x3, y3);
            if (p2.distanceTo(p3t) < p2.distanceTo(p3)) {
                p3 = p3t;
            }
        }
    } else {
        const y3: number = snap(p2.y, direct_norm.y);
        p3 = new Vector(p2.x, y3);
    }
    return p3;
}

function fillCircle(ctx: CanvasRenderingContext2D, center: Vector, radius: number) {
    ctx.beginPath();
    ctx.arc(...center.array(), radius, 0, 2*Math.PI);
    ctx.fill();
}

function strokeLine(ctx: CanvasRenderingContext2D, p1: Vector, p2: Vector) {
    ctx.beginPath();
    ctx.moveTo(...p1.array());
    ctx.lineTo(...p2.array());
    ctx.stroke();
}

function hittingCell(p1: Vector, p2: Vector) {
    const direct_norm: Vector = p2.sub(p1).norm();
    return new Vector(Math.floor(p2.x + Math.sign(direct_norm.x)*EPS),
                      Math.floor(p2.y + Math.sign(direct_norm.y)*EPS));
}

function sceneSize(scene: Scene): Vector {
    const height: number = scene.length;
    let max_width: number = 0;
    for (const row of scene) {
        max_width = Math.max(max_width, row.length);
    }
    return new Vector(max_width, height);
}

function drawCanvas(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.fillStyle = "#181818";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
}

function renderMinimap(ctx: CanvasRenderingContext2D, scene: Scene, player: Player, factor: number) {
    ctx.save();
    const scene_size: Vector = sceneSize(scene);

    // WARNING: Not process the corner case when x === 0;
    if (scene_size.x === 0) {
        throw new Error("x should not be 0.");
    }

    const rectify: number = scene_size.y / scene_size.x;
    const factor_x: number = ctx.canvas.width / scene_size.x * factor;
    const factor_y: number = ctx.canvas.height / scene_size.y * rectify * factor;
    ctx.scale(factor_x, factor_y);
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = "#505050";

    ctx.fillStyle = "#181818";
    ctx.fillRect(0, 0, scene_size.x, scene_size.y);

    for (let x = 0; x <= scene_size.x; ++x) {
        strokeLine(ctx, new Vector(x, 0), new Vector(x, scene_size.y));
    }

    for (let y = 0; y <= scene_size.y; ++y) {
        strokeLine(ctx, new Vector(0, y), new Vector(scene_size.x, y));
    }

    for (const [y, row] of scene.entries()) {
        for (const [x, color] of row.entries()) {
            if (color !== null)  {
                ctx.fillStyle = color.fillStyle();
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }

    ctx.fillStyle = "magenta";
    ctx.strokeStyle = "magenta";
    fillCircle(ctx, player.position, 0.1);

    const [p1, p2] = player.fovRange();
    strokeLine(ctx, player.position, p1);
    strokeLine(ctx, player.position, p2);
    strokeLine(ctx, p1, p2);

    ctx.restore();
}

function insideScene(scene: Scene, p: Vector): boolean {
    const scene_size: Vector = sceneSize(scene);
    if (p.x < 0 || p.x >= scene_size.x ||
        p.y < 0 || p.y >= scene_size.y) {
        return false;
    }
    return true;
}

function castRay(scene: Scene, p1: Vector, p2: Vector) {
    const start = p1;
    while (start.distanceTo(p1) <= FAR_CLIPPING_PLANE) {
        const c = hittingCell(p1, p2);
        // ?. will return `undefined` when scene[c.y] not exists.
        // So, use "!=" instead of "!==" to check null value.
        if (insideScene(scene, c) && scene[c.y]?.[c.x] != null) {
            break;
        }
        const p3 = rayStep(p1, p2);
        p1 = p2;
        p2 = p3;
    }
    return p2;
}

// calculate perpendicular distance.
// suppose we have three points named a, b, c
// v1 stands for the vector that pointed to c from a
// v2 stands for the vector from a to b
// this function calculates the perpendicular distance from c to the line through a and b
function calculateWallDist(v1: Vector, v2: Vector): number {
    const cos_theta: number = (v1.x * v2.x + v1.y * v2.y)/(v1.length() * v2.length());
    const sin_theta: number = Math.sqrt(1 - cos_theta**2);
    return sin_theta * v1.length();
}

function renderScene(ctx: CanvasRenderingContext2D, scene: Scene, player: Player) {
    ctx.save();
    const strip_width = Math.ceil(ctx.canvas.width/SCREEN_WIDTH);
    const focal_length = (ctx.canvas.width / 2) / Math.tan(FOV / 2);
    const [r1, r2] = player.fovRange();
    for (let x = 0; x <= SCREEN_WIDTH; ++x) {
        const p = castRay(scene, player.position, r1.lerp(r2, x/SCREEN_WIDTH));
        const cell = hittingCell(player.position, p);
        const color: Color|null|undefined = scene[cell.y]?.[cell.x];
        if (insideScene(scene, cell) && color != null) {
            const v = p.sub(player.position);
            const d = player.direction.norm();
            const wall_perpen_dist = v.dot(d);
            // TODO: need to figure out why use focal_length
            const strip_height = focal_length / wall_perpen_dist;
            ctx.fillStyle = color.brightness(1/wall_perpen_dist).fillStyle();
            ctx.fillRect(x*strip_width, (ctx.canvas.height - strip_height)*0.5,
                         strip_width, strip_height);
        }
    }
    ctx.restore();
}

function renderGame(ctx: CanvasRenderingContext2D, scene: Scene, player: Player) {
    ctx.reset();
    drawCanvas(ctx);
    renderScene(ctx, scene, player);
    renderMinimap(ctx, scene, player, 0.33);
}

function draw(ctx: CanvasRenderingContext2D) {
    const scene: Scene = [
        [null,  null,  Color.red(), Color.blue(), null, null, null, null, null],
        [null,  null,   null,  Color.cyan(), null, null, null, null, null],
        [null, Color.green(), Color.blue(), Color.magenta(), null, null, null, null, null],
        [null,  null,   null,   null,  null, null, null, null, null],
        [null,  null,   null,   null,  null, null, null, null, null],
        [null,  null,   null,   null,  null, null, null, null, null],
        [null,  null,   null,   null,  null, null, null, null, null],
    ];

    const scene_size = sceneSize(scene);
    const pos: Vector = new Vector(scene_size.x * 0.5, scene_size.y * 0.7);
    const direction: Vector = Vector.fromRadius(1, Math.PI / -2.0);
    const player = new Player(pos, direction);

    window.addEventListener("keydown", (event) => {
        if (!event.repeat) {
            switch(event.code) {
                case "KeyD": {
                    player.direction = player.direction.rotate(Math.PI*0.05);
                    renderGame(ctx, scene, player);
                    break;
                }
                case "KeyA": {
                    player.direction = player.direction.rotate(-1 * Math.PI*0.05);
                    renderGame(ctx, scene, player);
                    break;
                }
                case "KeyW": {
                    player.position = player.position.add(player.direction.norm().scale(0.5));
                    renderGame(ctx, scene, player);
                    break;
                }
                case "KeyS": {
                    player.position = player.position.sub(player.direction.norm().scale(0.5));
                    renderGame(ctx, scene, player);
                    break;
                }
            }
        }
    });

    renderGame(ctx, scene, player);
}

(() => {
    const game = document.getElementById("game") as (HTMLCanvasElement | null);

    if (game === null) {
        throw new Error("No canvas with id `game` is found.");
    }

    game.width = 800;
    game.height = 800;

    const ctx = game.getContext("2d");
    if (ctx === null) {
        throw new Error("2D context is not supported.");
    }

    draw(ctx);
})()
