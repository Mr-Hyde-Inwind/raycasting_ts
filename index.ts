const EPS: number = 1e-6;
const NEAR_CLIPPING_PLANE: number = 0.1;
const FAR_CLIPPING_PLANE: number = 10.0;
const FOV: number = Math.PI * 0.5;
const SCREEN_FACTOR = 20;
const SCREEN_WIDTH = Math.floor(16*SCREEN_FACTOR);
const SCREEN_HEIGHT = Math.floor(9*SCREEN_FACTOR);
const PLAYER_ANGULAR_SPEED = Math.PI * 0.5;
const PLAYER_SPEED = 1.5;
const PLAYER_SIZE = 0.5;

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
              + `${this.a})`;
    }
}

class Vector {
    x: number;
    y: number;

    static fromRadius(rad: number): Vector {
        return new Vector(Math.cos(rad), Math.sin(rad));
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

    rot90(): Vector {
        return new Vector(-this.y, this.x)
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

    // fovRange return two vector from player position to the two sides of NEAR_CLIPPING_PLANE
    fovRange():[Vector, Vector] {
        const ray_len: number = NEAR_CLIPPING_PLANE / Math.cos(FOV/2);
        const p1: Vector = this.direction.rotate(-1 * FOV/2).scale(ray_len);
        const p2: Vector = this.direction.rotate(FOV/2).scale(ray_len);
        return [p1, p2];
    }
}

class Scene {
    wall: Array<Color|null|HTMLImageElement>;
    width: number;
    height: number;

    constructor(wall_map: Array<Array<Color|null|HTMLImageElement>>) {
        // Suppose to be a rectangle
        this.height = wall_map.length;
        const [first_row] = wall_map;
        if (!first_row) {
            throw new Error("Wall map should have at least one row.")
        }
        this.width = first_row.length
        this.wall = wall_map.flat();
    }

    inside(x: number, y: number) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return false;
        }
        return true;
    }

    getWall(x: number, y: number) {
        if (!this.inside(x, y)) {
            return null;
        }
        return this.wall[y*this.width + x]
    }
}

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

function drawCanvas(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.fillStyle = "#181818";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = "#303030";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height * 0.5);
    ctx.restore();
}

function renderMinimap(ctx: CanvasRenderingContext2D, scene: Scene, player: Player, factor: number) {
    ctx.save();
    const factor_x: number = ctx.canvas.height / scene.height * factor;
    const factor_y: number = ctx.canvas.height / scene.height * factor;
    ctx.scale(factor_x, factor_y);
    ctx.lineWidth = 0.1;
    ctx.strokeStyle = "#505050";

    ctx.fillStyle = "#181818";
    ctx.fillRect(0, 0, scene.width, scene.height);

    for (let x = 0; x <= scene.width; ++x) {
        strokeLine(ctx, new Vector(x, 0), new Vector(x, scene.height));
    }

    for (let y = 0; y <= scene.height; ++y) {
        strokeLine(ctx, new Vector(0, y), new Vector(scene.width, y));
    }

    for (let y = 0; y < scene.height; y++) {
        for (let x = 0; x < scene.width; x++) {
            const wall = scene.getWall(x, y);
            if (wall instanceof Color)  {
                ctx.fillStyle = wall.fillStyle();
                ctx.fillRect(x, y, 1, 1);
            } else if (wall instanceof HTMLImageElement) {
                ctx.drawImage(wall,
                             0, 0, wall.width, wall.height,
                             x, y, 1, 1);
            }
        }
    }

    ctx.fillStyle = "magenta";
    ctx.strokeStyle = "magenta";

    ctx.beginPath()
    const top = player.position.add(player.direction.scale(PLAYER_SIZE/2));
    const tp = player.position.sub(player.direction.scale(PLAYER_SIZE/2));
    const bottom_left = tp.add(player.direction.scale(PLAYER_SIZE/2).rot90());
    const bottom_right = tp.sub(player.direction.scale(PLAYER_SIZE/2).rot90());

    ctx.moveTo(top.x, top.y);
    ctx.lineTo(bottom_left.x, bottom_left.y);
    ctx.lineTo(bottom_right.x, bottom_right.y);
    ctx.fill();

    ctx.restore();
}

function hittingCell(p1: Vector, p2: Vector) {
    const direct_norm: Vector = p2.sub(p1).norm();
    return new Vector(Math.floor(p2.x + Math.sign(direct_norm.x)*EPS),
                      Math.floor(p2.y + Math.sign(direct_norm.y)*EPS));
}

function castRay(scene: Scene, p1: Vector, p2: Vector) {
    const start = p1;
    while (start.distanceTo(p1) <= FAR_CLIPPING_PLANE) {
        const c = hittingCell(p1, p2);
        // ?. will return `undefined` when scene[c.y] not exists.
        // So, use "!=" instead of "!==" to check null value.
        if (scene.inside(c.x, c.y) && scene.getWall(c.x, c.y) != null) {
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

function renderCeiling(ctx: CanvasRenderingContext2D, scene: Scene, player: Player) {
    ctx.save();
    const player_height: number = SCREEN_HEIGHT / 2;
    const [r1, r2]: [Vector, Vector] = player.fovRange();
    const ray_len: number = r1.length();
    ctx.scale(ctx.canvas.width / SCREEN_WIDTH, ctx.canvas.height / SCREEN_HEIGHT);
    for (let y = SCREEN_HEIGHT / 2 - 1; y >= 0; y--) {
        const z = y;
        const actual_len = ray_len / (player_height - z) / NEAR_CLIPPING_PLANE * player_height;
        const extended_r1: Vector = r1.norm().scale(actual_len)
        const extended_r2: Vector = r2.norm().scale(actual_len)
        for (let x = 0; x <= SCREEN_WIDTH; x++) {
            const t: Vector = extended_r1.lerp(extended_r2, x/SCREEN_WIDTH).add(player.position);
            const p: Vector = new Vector(Math.floor(t.x), Math.floor(t.y));
            let color: Color|undefined = undefined;
            if ((Math.abs(p.x)+Math.abs(p.y))%2) {
                color = Color.blue();
            } else {
                color = Color.red();
            }
            ctx.fillStyle = color.brightness(1 - y/player_height).fillStyle();
            ctx.fillRect(x, y, 1, 1);
        }
    }
    ctx.restore();
}

function renderFloor(ctx: CanvasRenderingContext2D, scene: Scene, player: Player) {
    ctx.save();
    const player_height: number = SCREEN_HEIGHT / 2;
    const [r1, r2]: [Vector, Vector] = player.fovRange();
    const ray_len: number = r1.length();
    ctx.scale(ctx.canvas.width / SCREEN_WIDTH, ctx.canvas.height / SCREEN_HEIGHT);
    for (let y = SCREEN_HEIGHT/2; y < SCREEN_HEIGHT; y++) {
        const z = (SCREEN_HEIGHT - y);
        const actual_len = ray_len / (player_height - z) / NEAR_CLIPPING_PLANE * player_height;
        const extended_r1: Vector = r1.norm().scale(actual_len)
        const extended_r2: Vector = r2.norm().scale(actual_len)
        for (let x = 0; x <= SCREEN_WIDTH; x++) {
            const t: Vector = extended_r1.lerp(extended_r2, x/SCREEN_WIDTH).add(player.position);
            const p: Vector = new Vector(Math.floor(t.x), Math.floor(t.y));
            let color: Color|undefined = undefined;
            if ((Math.abs(p.x) + Math.abs(p.y))%2) {
                color = Color.green();
            } else {
                color = Color.magenta();
            }
            ctx.fillStyle = color.brightness(1 - z/player_height).fillStyle();
            ctx.fillRect(x, y, 1, 1);
        }
    }
    ctx.restore();
}

function renderScene(ctx: CanvasRenderingContext2D, scene: Scene, player: Player) {
    ctx.save();
    ctx.scale(ctx.canvas.width / SCREEN_WIDTH, ctx.canvas.height / SCREEN_HEIGHT);
    const [r1, r2] = player.fovRange();
    for (let x = 0; x < SCREEN_WIDTH; ++x) {
        const p = castRay(scene, player.position, player.position.add(r1.lerp(r2, x/SCREEN_WIDTH)));
        const cell_pos = hittingCell(player.position, p);
        const cell: Color|HTMLImageElement|null|undefined = scene.getWall(cell_pos.x, cell_pos.y);
        if (scene.inside(cell_pos.x, cell_pos.y)) {
            const v = p.sub(player.position);
            const d = player.direction;
            const wall_perpen_dist = v.dot(d);
            const strip_height = SCREEN_HEIGHT / wall_perpen_dist;
            if (cell instanceof Color) {
                ctx.fillStyle = cell.brightness(1/wall_perpen_dist).fillStyle();
                ctx.fillRect(
                    Math.floor(x), Math.floor((SCREEN_HEIGHT - strip_height)*0.5),
                    1, Math.ceil(strip_height));
            } else if (cell instanceof HTMLImageElement) {
                const t: Vector = p.sub(cell_pos);
                let tx: number = 0;
                if ((Math.abs(t.x) < EPS || Math.abs(t.x - 1) < EPS) && t.y > 0) {
                    tx = t.y;
                } else {
                    tx = t.x;
                }

                ctx.drawImage(
                    cell,
                    Math.floor(tx*cell.width), 0, 1, cell.height,
                    Math.floor(x), Math.floor((SCREEN_HEIGHT - strip_height) * 0.5),
                    1, Math.ceil(strip_height * 1.01));
                ctx.fillStyle = new Color(0, 0, 0, 1 - 1/wall_perpen_dist).fillStyle();
                ctx.fillRect(
                    Math.floor(x), Math.floor((SCREEN_HEIGHT - strip_height)*0.5),
                    1, Math.ceil(strip_height * 1.01));
            }
        }
    }
    ctx.restore();
}

function renderGame(ctx: CanvasRenderingContext2D, scene: Scene, player: Player) {
    ctx.reset();
    drawCanvas(ctx);
    renderFloor(ctx, scene, player);
    renderCeiling(ctx, scene, player);
    renderScene(ctx, scene, player);
    renderMinimap(ctx, scene, player, 0.33);
}

let moving_forward: boolean = false;
let moving_backward: boolean = false;
let moving_right: boolean = false;
let moving_left: boolean = false;

async function init(): Promise<[Player, Scene]> {
    const div = document.getElementById("game_container") as (HTMLDivElement | null);
    if (div === null) throw new Error("No div element with id 'game_container' found.")

    div.addEventListener("keydown", (event) => {
        if (!event.repeat) {
            switch(event.code) {
                case "KeyW": moving_forward = true; break;
                case "KeyS": moving_backward = true; break;
                case "KeyA": moving_left = true; break;
                case "KeyD": moving_right = true; break;
            }
        }
        event.stopPropagation();
    });

    div.addEventListener("keyup", (event) => {
        if (!event.repeat) {
            switch(event.code) {
                case "KeyW": moving_forward = false; break;
                case "KeyS": moving_backward = false; break;
                case "KeyA": moving_left = false; break;
                case "KeyD": moving_right = false; break;
            }
        }
        event.stopPropagation();
    });

    const wall: HTMLImageElement = await loadImage("assets/DSC_1025_0.jpg")
    const scene: Scene = new Scene([
        [null,  null,  wall, wall, null, null, null, null, null],
        [null,  null,   null,  wall, null, null, null, null, null],
        [null, wall, wall, wall, null, null, null, null, null],
        [null,  null,   null,   null,  null, null, null, null, null],
        [null,  null,   null,   null,  null, null, null, null, null],
        [null,  null,   wall,   null,  null, null, null, null, null],
        [null,  null,   null,   null,  null, null, null, null, null],
    ]);

    const pos: Vector = new Vector(scene.width * 0.5, scene.height * 0.7);
    const direction: Vector = Vector.fromRadius(Math.PI / -2.0);
    const player = new Player(pos, direction);
    return new Promise<[Player, Scene]>((resolve, reject) => {
        resolve([player, scene])
    });
}

let start: number | undefined = undefined;
let previousTimestamp: number | undefined = undefined;

function canGoThere(scene: Scene, p: Vector): boolean {
    const top_left = new Vector(p.x - PLAYER_SIZE/2, p.y - PLAYER_SIZE/2);
    for (let x = 0; x < 2; x++) {
        for (let y = 0; y < 2; y++) {
            const current = new Vector(top_left.x + x*PLAYER_SIZE, top_left.y + y*PLAYER_SIZE);
            if (scene.inside(current.x, current.y)
                && scene.getWall(Math.floor(current.x), Math.floor(current.y))) {
                return false;
            }
        }
    }
    return true;
}

function renderFrame(ctx: CanvasRenderingContext2D, player: Player, scene: Scene) {
    const step = (timestamp: number) => {
        if (start === undefined) {
            start = timestamp;
        }
        if (previousTimestamp === undefined) {
            previousTimestamp = start;
        }
        const delta_time: number = (timestamp - previousTimestamp) / 1000;
        previousTimestamp = timestamp;

        let velocity: number = 0;
        if (moving_forward) {
            velocity += PLAYER_SPEED * delta_time;
        }
        if (moving_backward) {
            velocity -= PLAYER_SPEED * delta_time;
        }

        let angular_velocity: number = 0;
        if (moving_left) {
            angular_velocity -= PLAYER_ANGULAR_SPEED * delta_time;
        }
        if (moving_right) {
            angular_velocity += PLAYER_ANGULAR_SPEED * delta_time;
        }

        const td = player.direction.rotate(angular_velocity);
        const movement = player.direction.scale(velocity);
        const x_move = player.position.add(new Vector(movement.x, 0));
        if (canGoThere(scene, x_move)) {
            player.position = x_move;
        }
        const y_move = player.position.add(new Vector(0, movement.y));
        if (canGoThere(scene, y_move)) {
            player.position = y_move;
        }
        player.direction = td
        renderGame(ctx, scene, player);
        window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
}

async function loadImage(url: string): Promise<HTMLImageElement> {
    const image = new Image()
    image.src = url
    return new Promise((resolve, reject) => {
        image.onload = () => resolve(image);
        image.onerror = reject;
    });
}

(async () => {
    const game = document.getElementById("game") as (HTMLCanvasElement | null);

    if (game === null) {
        throw new Error("No canvas with id `game` is found.");
    }

    game.width = 16 * 80;
    game.height = 9 * 80;

    const ctx = game.getContext("2d");
    if (ctx === null) {
        throw new Error("2D context is not supported.");
    }

    ctx.imageSmoothingEnabled = false;

    // draw(ctx);
    let [player, scene] = await init();
    renderFrame(ctx, player, scene);
})()
