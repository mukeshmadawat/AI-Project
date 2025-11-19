import * as THREE from 'three';
// NO POST-PROCESSING - Direct rendering only for clear maze visibility

// Configuration
let GRID_SIZE = 20;
let START = { row: 1, col: 1 };
let GOAL = { row: GRID_SIZE - 2, col: GRID_SIZE - 2 };

const COLORS = {
    background: 0x0a0e27,
    wall: 0x1a1f3a,
    floor: 0x0f1220,
    start: 0x00ff66,
    goal: 0xff3344,
    BFS: 0x00d4ff,
    DFS: 0xff00ff,
    'A*': 0x00ff88,
    GREEDY: 0xffaa00,
    path: 0xffd700
};

// Global state
let maze = [];
let scene, camera, renderer;
// NO composer - direct rendering only
let selectedAlgorithm = 'BFS';
let isAnimating = false;
let exploredMeshes = [];
let pathMeshes = [];
let animationSpeed = 150;
let isCompareMode = false;
let gridHelper = null;
let instancedExploredMesh = null;
let exploredCount = 0;
let exploredPositions = [];

// Compare mode state - 4 separate scenes
let compareScenes = {};
let compareRenderers = {};
let compareCameras = {};
let compareAnimationFrames = {};

// Particle system
let particleSystems = [];
let particlePool = [];

// Effects settings - NO BLUR/POST-PROCESSING
let effectsEnabled = {
    particles: true,
    shadows: false,
    bloom: false
};

// FPS counter
let lastTime = performance.now();
let frames = 0;
let fps = 60;
let fpsEnabled = false;

// FPS tracking for compare mode
let compareFpsCounters = {};



// Generate maze
function generateMaze() {
    maze = Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(1));

    const stack = [{ row: 1, col: 1 }];
    maze[1][1] = 0;

    while (stack.length > 0) {
        const current = stack[stack.length - 1];
        const neighbors = [];

        const directions = [
            { row: -2, col: 0, wallRow: -1, wallCol: 0 },
            { row: 2, col: 0, wallRow: 1, wallCol: 0 },
            { row: 0, col: -2, wallRow: 0, wallCol: -1 },
            { row: 0, col: 2, wallRow: 0, wallCol: 1 }
        ];

        for (const dir of directions) {
            const newRow = current.row + dir.row;
            const newCol = current.col + dir.col;

            if (newRow > 0 && newRow < GRID_SIZE - 1 &&
                newCol > 0 && newCol < GRID_SIZE - 1 &&
                maze[newRow][newCol] === 1) {
                neighbors.push({ ...dir, newRow, newCol });
            }
        }

        if (neighbors.length > 0) {
            const next = neighbors[Math.floor(Math.random() * neighbors.length)];
            maze[next.newRow][next.newCol] = 0;
            maze[current.row + next.wallRow][current.col + next.wallCol] = 0;
            stack.push({ row: next.newRow, col: next.newCol });
        } else {
            stack.pop();
        }
    }

    maze[START.row][START.col] = 0;
    maze[GOAL.row][GOAL.col] = 0;

    let pathRow = START.row;
    let pathCol = START.col;
    while (pathRow !== GOAL.row || pathCol !== GOAL.col) {
        if (pathRow < GOAL.row && maze[pathRow + 1] && maze[pathRow + 1][pathCol] !== undefined) {
            pathRow++;
            maze[pathRow][pathCol] = 0;
        } else if (pathCol < GOAL.col && maze[pathRow][pathCol + 1] !== undefined) {
            pathCol++;
            maze[pathRow][pathCol] = 0;
        } else if (pathRow > GOAL.row && maze[pathRow - 1] && maze[pathRow - 1][pathCol] !== undefined) {
            pathRow--;
            maze[pathRow][pathCol] = 0;
        } else if (pathCol > GOAL.col && maze[pathRow][pathCol - 1] !== undefined) {
            pathCol--;
            maze[pathRow][pathCol] = 0;
        } else {
            break;
        }
    }
}

// Initialize Three.js
function initThreeJS() {
    const container = document.getElementById('singleView');
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.background);

    camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(GRID_SIZE * 0.8, GRID_SIZE * 0.8, GRID_SIZE * 0.8);
    camera.lookAt(GRID_SIZE / 2, 0, GRID_SIZE / 2);

    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: false,
        precision: 'highp',
        powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0d1117);
    renderer.shadowMap.enabled = false;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;
    const size = Math.min(window.innerWidth * 0.7, window.innerHeight - 20);
    renderer.setSize(size, size);
    container.appendChild(renderer.domElement);

    // NO POST-PROCESSING - Direct rendering only
    setupLighting();
    setupControls();
    generateMaze();
    buildScene();
    animate();
}

// NO POST-PROCESSING - Removed for clear maze visibility
// Direct rendering ensures sharp, unblurred maze

// Global lighting references for dynamic adjustment
let ambientLight, keyLight, fillLight;
// NO bloomPass - clear rendering only

// Setup lighting with bright, clear illumination (NO SHADOWS)
function setupLighting() {
    // Bright ambient light for clear maze visibility
    ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Bright key light - NO SHADOWS for clear visibility
    keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(GRID_SIZE * 1.5, GRID_SIZE * 2, GRID_SIZE * 1.5);
    keyLight.castShadow = false;
    scene.add(keyLight);

    // Fill light - additional illumination
    fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-GRID_SIZE, GRID_SIZE, -GRID_SIZE);
    scene.add(fillLight);

    // NO FOG - clear visibility at all distances
}

// Keep lighting constant and bright for clear visibility
function updateLightingBasedOnZoom() {
    // Constant bright lighting - no adaptive changes that could obscure maze
    if (ambientLight) ambientLight.intensity = 0.6;
    if (keyLight) keyLight.intensity = 0.8;
    if (fillLight) fillLight.intensity = 0.5;
}

// Setup controls for single view
function setupControls() {
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    renderer.domElement.addEventListener('mousedown', (e) => {
        isDragging = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    renderer.domElement.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;

            const radius = camera.position.length();
            const theta = Math.atan2(camera.position.x, camera.position.z);
            const phi = Math.acos(camera.position.y / radius);

            const newTheta = theta - deltaX * 0.005;
            const newPhi = Math.max(0.1, Math.min(Math.PI - 0.1, phi + deltaY * 0.005));

            camera.position.x = radius * Math.sin(newPhi) * Math.sin(newTheta);
            camera.position.y = radius * Math.cos(newPhi);
            camera.position.z = radius * Math.sin(newPhi) * Math.cos(newTheta);
            camera.lookAt(GRID_SIZE / 2, 0, GRID_SIZE / 2);

            previousMousePosition = { x: e.clientX, y: e.clientY };
        }
    });

    renderer.domElement.addEventListener('mouseup', () => {
        isDragging = false;
    });

    renderer.domElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        // Get current camera distance
        const center = new THREE.Vector3(GRID_SIZE / 2, 0, GRID_SIZE / 2);
        let radius = camera.position.distanceTo(center);
        
        // Zoom in/out with mouse wheel
        const zoomSpeed = 2;
        radius -= e.deltaY * 0.05 * zoomSpeed;
        
        // Clamp zoom distance
        radius = Math.max(15, Math.min(80, radius));
        
        // Update camera position while maintaining angle
        const theta = Math.atan2(camera.position.x - GRID_SIZE / 2, camera.position.z - GRID_SIZE / 2);
        const phi = Math.acos((camera.position.y) / camera.position.length());
        
        camera.position.x = GRID_SIZE / 2 + radius * Math.sin(phi) * Math.sin(theta);
        camera.position.y = radius * Math.cos(phi);
        camera.position.z = GRID_SIZE / 2 + radius * Math.sin(phi) * Math.cos(theta);
        
        camera.lookAt(GRID_SIZE / 2, 0, GRID_SIZE / 2);
        
        // Update lighting based on new zoom level
        updateLightingBasedOnZoom();
    });
}

// Setup scroll controls for compare mode windows
function setupScrollControls(container, camera, scene) {
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    
    container.addEventListener('mousedown', (e) => {
        isDragging = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
        container.style.cursor = 'grabbing';
    });
    
    container.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;
            
            // Rotate camera based on mouse movement
            const radius = camera.position.length();
            const theta = Math.atan2(camera.position.x, camera.position.z);
            const phi = Math.acos(camera.position.y / radius);
            
            const newTheta = theta - deltaX * 0.005;
            const newPhi = Math.max(0.1, Math.min(Math.PI - 0.1, phi + deltaY * 0.005));
            
            camera.position.x = radius * Math.sin(newPhi) * Math.sin(newTheta);
            camera.position.y = radius * Math.cos(newPhi);
            camera.position.z = radius * Math.sin(newPhi) * Math.cos(newTheta);
            camera.lookAt(GRID_SIZE / 2, 0, GRID_SIZE / 2);
            
            previousMousePosition = { x: e.clientX, y: e.clientY };
        }
    });
    
    container.addEventListener('mouseup', () => {
        isDragging = false;
        container.style.cursor = 'grab';
    });
    
    container.addEventListener('mouseleave', () => {
        isDragging = false;
        container.style.cursor = 'grab';
    });
    
    // Scroll controls - smooth camera panning
    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Scroll up/down to pan vertically (smooth)
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            camera.position.y += e.deltaY * 0.01;
            camera.position.y = Math.max(GRID_SIZE * 0.3, Math.min(GRID_SIZE * 1.5, camera.position.y));
        } else {
            // Horizontal scroll to rotate
            const radius = camera.position.length();
            const theta = Math.atan2(camera.position.x, camera.position.z);
            const phi = Math.acos(camera.position.y / radius);
            const newTheta = theta - e.deltaX * 0.01;
            
            camera.position.x = radius * Math.sin(phi) * Math.sin(newTheta);
            camera.position.z = radius * Math.sin(phi) * Math.cos(newTheta);
        }
        
        camera.lookAt(GRID_SIZE / 2, 0, GRID_SIZE / 2);
    }, { passive: false });
}

// Build scene
function buildScene() {
    while(scene.children.length > 4) {
        const object = scene.children[4];
        if (object.geometry) object.geometry.dispose();
        if (object.material) object.material.dispose();
        scene.remove(object);
    }

    // Clear floor with simple material
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE),
        new THREE.MeshLambertMaterial({ 
            color: COLORS.floor
        })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(GRID_SIZE / 2, -0.5, GRID_SIZE / 2);
    floor.receiveShadow = false;
    scene.add(floor);

    if (gridHelper) {
        scene.remove(gridHelper);
    }
    gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, 0x444466, 0x222233);
    gridHelper.position.set(GRID_SIZE / 2, -0.49, GRID_SIZE / 2);
    scene.add(gridHelper);

    const wallPositions = [];
    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            if (maze[row][col] === 1) {
                wallPositions.push({ x: col, z: row });
            }
        }
    }

    const wallGeometry = new THREE.BoxGeometry(1, 2, 1);
    const wallMaterial = new THREE.MeshLambertMaterial({ 
        color: COLORS.wall
    });
    const wallMesh = new THREE.InstancedMesh(wallGeometry, wallMaterial, wallPositions.length);
    wallMesh.castShadow = false;
    wallMesh.receiveShadow = false;

    const matrix = new THREE.Matrix4();
    wallPositions.forEach((pos, i) => {
        matrix.setPosition(pos.x + 0.5, 1, pos.z + 0.5);
        wallMesh.setMatrixAt(i, matrix);
    });
    wallMesh.instanceMatrix.needsUpdate = true;
    scene.add(wallMesh);

    const startSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 16, 16),
        new THREE.MeshBasicMaterial({ 
            color: COLORS.start
        })
    );
    startSphere.position.set(START.col + 0.5, 0.6, START.row + 0.5);
    startSphere.castShadow = false;
    startSphere.renderOrder = 1000;
    startSphere.userData.isStart = true;
    scene.add(startSphere);

    const goalSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 16, 16),
        new THREE.MeshBasicMaterial({ 
            color: COLORS.goal
        })
    );
    goalSphere.position.set(GOAL.col + 0.5, 0.6, GOAL.row + 0.5);
    goalSphere.castShadow = false;
    goalSphere.renderOrder = 1000;
    goalSphere.userData.isGoal = true;
    scene.add(goalSphere);

    exploredMeshes = [];
    pathMeshes = [];
    exploredCount = 0;
    exploredPositions = [];
    
    // Pre-create instanced mesh for explored nodes (performance optimization)
    const maxExplored = GRID_SIZE * GRID_SIZE;
    const exploredGeometry = new THREE.BoxGeometry(0.7, 0.4, 0.7);
    const exploredMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00d4ff,
        transparent: true,
        opacity: 0.8
    });
    instancedExploredMesh = new THREE.InstancedMesh(exploredGeometry, exploredMaterial, maxExplored);
    instancedExploredMesh.castShadow = false;
    instancedExploredMesh.receiveShadow = false;
    instancedExploredMesh.count = 0;
    scene.add(instancedExploredMesh);
    
    // Clear particle systems
    particleSystems.forEach(system => {
        scene.remove(system);
        if (system.geometry) system.geometry.dispose();
        if (system.material) system.material.dispose();
    });
    particleSystems = [];
}

// Animate
function animate() {
    requestAnimationFrame(animate);
    
    // Update FPS counter
    if (fpsEnabled) {
        frames++;
        const currentTime = performance.now();
        if (currentTime >= lastTime + 1000) {
            fps = Math.round((frames * 1000) / (currentTime - lastTime));
            document.getElementById('fpsCounter').textContent = `FPS: ${fps}`;
            frames = 0;
            lastTime = currentTime;
        }
    }
    
    // Keep lighting constant and bright
    // NO pulsing effects - keep markers visible at all times
    
    // Update particles
    updateParticles();
    
    // DIRECT RENDERING ONLY - NO POST-PROCESSING
    renderer.render(scene, camera);
}

// Particle system class
class Particle {
    constructor(position, velocity, color, lifetime) {
        this.position = position.clone();
        this.velocity = velocity.clone();
        this.color = color;
        this.lifetime = lifetime;
        this.age = 0;
        this.size = Math.random() * 0.15 + 0.1;
        this.active = true;
    }
    
    update(delta) {
        this.age += delta;
        if (this.age >= this.lifetime) {
            this.active = false;
            return false;
        }
        
        this.position.add(this.velocity.clone().multiplyScalar(delta));
        this.velocity.y -= 0.005; // gravity
        this.velocity.multiplyScalar(0.98); // air resistance
        
        return true;
    }
}

// Create particle burst at position
function createParticleBurst(x, y, z, color, count = 20) {
    if (!effectsEnabled.particles) return;
    
    const particles = [];
    const particleGeometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const sizes = [];
    
    for (let i = 0; i < count; i++) {
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.05,
            Math.random() * 0.08,
            (Math.random() - 0.5) * 0.05
        );
        
        const particle = new Particle(
            new THREE.Vector3(x, y, z),
            velocity,
            color,
            1000 + Math.random() * 1000
        );
        
        particles.push(particle);
        positions.push(x, y, z);
        
        const c = new THREE.Color(color);
        colors.push(c.r, c.g, c.b);
        sizes.push(particle.size);
    }
    
    particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    particleGeometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    
    const particleMaterial = new THREE.PointsMaterial({
        size: 0.2,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    
    const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    particleSystem.userData = { particles, startTime: performance.now() };
    scene.add(particleSystem);
    particleSystems.push(particleSystem);
}

// Update all particle systems
function updateParticles() {
    if (!effectsEnabled.particles) return;
    
    const currentTime = performance.now();
    
    for (let i = particleSystems.length - 1; i >= 0; i--) {
        const system = particleSystems[i];
        const particles = system.userData.particles;
        const delta = 16; // ~60fps
        
        let activeCount = 0;
        const positions = system.geometry.attributes.position.array;
        const colors = system.geometry.attributes.color.array;
        
        for (let j = 0; j < particles.length; j++) {
            const particle = particles[j];
            if (particle.update(delta)) {
                positions[j * 3] = particle.position.x;
                positions[j * 3 + 1] = particle.position.y;
                positions[j * 3 + 2] = particle.position.z;
                
                const lifeRatio = 1 - (particle.age / particle.lifetime);
                const c = new THREE.Color(particle.color);
                colors[j * 3] = c.r * lifeRatio;
                colors[j * 3 + 1] = c.g * lifeRatio;
                colors[j * 3 + 2] = c.b * lifeRatio;
                
                activeCount++;
            }
        }
        
        system.geometry.attributes.position.needsUpdate = true;
        system.geometry.attributes.color.needsUpdate = true;
        system.material.opacity = Math.min(1, activeCount / particles.length);
        
        if (activeCount === 0) {
            scene.remove(system);
            system.geometry.dispose();
            system.material.dispose();
            particleSystems.splice(i, 1);
        }
    }
}

// UI Controls
function selectAlgorithm(algo) {
    selectedAlgorithm = algo;
    console.log('Algorithm selected:', algo);
}

function selectAlgorithmCard(algo, element) {
    selectedAlgorithm = algo;
    console.log('Algorithm card clicked:', algo);
    
    // Remove selected class from all cards
    document.querySelectorAll('.algo-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Add selected class to clicked card
    element.classList.add('selected');
    console.log('Selected algorithm is now:', selectedAlgorithm);
}

function toggleSettings() {
    const modal = document.getElementById('settingsModal');
    modal.classList.toggle('active');
}

function setQuality(level) {
    document.querySelectorAll('.quality-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    switch(level) {
        case 'low':
            renderer.setPixelRatio(1);
            break;
        case 'medium':
            renderer.setPixelRatio(1.5);
            break;
        case 'high':
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            break;
    }
}

function updateSpeedValue(value) {
    animationSpeed = parseInt(value);
    document.getElementById('speedValue').textContent = value + 'ms';
}

function toggleEffect(effect, element) {
    if (effect === 'fps') {
        fpsEnabled = !fpsEnabled;
        const fpsCounter = document.getElementById('fpsCounter');
        fpsCounter.style.display = fpsEnabled ? 'block' : 'none';
        
        // Toggle all compare mode FPS monitors
        document.querySelectorAll('.fps-monitor').forEach(monitor => {
            if (fpsEnabled) {
                monitor.classList.add('active');
            } else {
                monitor.classList.remove('active');
            }
        });
        
        element.classList.toggle('active');
        return;
    }
    
    if (effect === 'grid') {
        if (gridHelper) {
            gridHelper.visible = !gridHelper.visible;
        }
        element.classList.toggle('active');
        return;
    }
    
    effectsEnabled[effect] = !effectsEnabled[effect];
    element.classList.toggle('active');
    
    if (effect === 'shadows') {
        renderer.shadowMap.enabled = effectsEnabled.shadows;
    }
    
    if (effect === 'particles' && !effectsEnabled.particles) {
        // Clear all particles
        particleSystems.forEach(system => {
            scene.remove(system);
            system.geometry.dispose();
            system.material.dispose();
        });
        particleSystems = [];
    }
}

function changeDifficulty(size) {
    GRID_SIZE = parseInt(size);
    START = { row: 1, col: 1 };
    GOAL = { row: GRID_SIZE - 2, col: GRID_SIZE - 2 };
    
    // Update camera position based on grid size
    camera.position.set(GRID_SIZE * 0.8, GRID_SIZE * 0.8, GRID_SIZE * 0.8);
    camera.lookAt(GRID_SIZE / 2, 0, GRID_SIZE / 2);
    
    generateNewMaze();
}

async function compareAll() {
    console.log('=== COMPARE ALL CLICKED ===');
    console.log('Is animating:', isAnimating);
    console.log('Compare mode:', isCompareMode);
    
    if (isAnimating) {
        console.log('Animation in progress, ignoring');
        return;
    }
    
    isCompareMode = !isCompareMode;
    const singleView = document.getElementById('singleView');
    const compareGrid = document.getElementById('compareGrid');
    const backButton = document.getElementById('backButton');
    
    if (isCompareMode) {
        console.log('Entering compare mode...');
        singleView.classList.add('hidden');
        compareGrid.classList.add('active');
        if (backButton) backButton.classList.remove('hidden');
        
        // Initialize 4 separate 3D scenes
        initCompareScenes();
        
        // Run all algorithms simultaneously
        isAnimating = true;
        const algorithms = ['BFS', 'DFS', 'A*', 'GREEDY'];
        console.log('Running algorithms:', algorithms);
        
        try {
            // Run all algorithms in parallel
            await Promise.all(algorithms.map(async (algo) => {
                console.log('Starting', algo);
                const startTime = performance.now();
                const color = COLORS[algo];
                const containerId = algo.toLowerCase().replace('*', 'star') + 'Canvas';
                let result;
                
                switch (algo) {
                    case 'BFS': result = await runBFSInCompare(color, containerId); break;
                    case 'DFS': result = await runDFSInCompare(color, containerId); break;
                    case 'A*': result = await runAStarInCompare(color, containerId); break;
                    case 'GREEDY': result = await runGreedyInCompare(color, containerId); break;
                }
                
                const timeTaken = Math.round(performance.now() - startTime);
                console.log(algo, 'complete:', result.explored.size, 'nodes,', result.path.length, 'path,', timeTaken + 'ms');
                
                // Update stats for this algorithm
                const statsId = algo.toLowerCase().replace('*', 'star') + 'Stats';
                const statsEl = document.getElementById(statsId);
                if (statsEl) {
                    statsEl.innerHTML = `
                        <span>Nodes: <strong>${result.explored.size}</strong></span>
                        <span>Path: <strong>${result.path.length}</strong></span>
                        <span>Time: <strong>${timeTaken}ms</strong></span>
                    `;
                }
            }));
            console.log('All algorithms complete!');
        } catch (error) {
            console.error('Error in compare mode:', error);
        } finally {
            isAnimating = false;
        }
    } else {
        console.log('Exiting compare mode...');
        // Clean up compare mode
        cleanupCompareScenes();
        singleView.classList.remove('hidden');
        compareGrid.classList.remove('active');
        if (backButton) backButton.classList.add('hidden');
    }
    console.log('=== COMPARE ALL COMPLETE ===');
}

function generateNewMaze() {
    console.log('=== GENERATING NEW MAZE ===');
    generateMaze();
    console.log('Maze generated, rebuilding scene...');
    buildScene();
    resetVisualization();
    console.log('New maze ready!');
}

function resetVisualization() {
    console.log('=== RESET VISUALIZATION ===');
    // Stop any ongoing animation
    isAnimating = false;
    
    // Clear explored meshes
    exploredMeshes.forEach(mesh => {
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
        scene.remove(mesh);
    });
    
    // Clear path meshes
    pathMeshes.forEach(mesh => {
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
        scene.remove(mesh);
    });
    
    exploredMeshes = [];
    pathMeshes = [];
    exploredCount = 0;
    exploredPositions = [];
    console.log('Cleared', exploredMeshes.length, 'explored and', pathMeshes.length, 'path meshes');
    
    // Reset instanced mesh
    if (instancedExploredMesh) {
        instancedExploredMesh.count = 0;
        instancedExploredMesh.instanceMatrix.needsUpdate = true;
    }
    
    // Clear particles
    particleSystems.forEach(system => {
        scene.remove(system);
        if (system.geometry) system.geometry.dispose();
        if (system.material) system.material.dispose();
    });
    particleSystems = [];

    // Reset statistics
    document.getElementById('statNodes').textContent = '0';
    document.getElementById('statPath').textContent = '0';
    document.getElementById('statTime').textContent = '0';
    console.log('Statistics reset');
    
    // If in compare mode, reset all compare scenes
    if (isCompareMode) {
        console.log('Exiting compare mode during reset');
        cleanupCompareScenes();
        isCompareMode = false;
        document.getElementById('singleView').classList.remove('hidden');
        document.getElementById('compareGrid').classList.remove('active');
        const backButton = document.getElementById('backButton');
        if (backButton) backButton.classList.add('hidden');
    }
    console.log('Reset complete!');
}

// Solve maze
async function solveMaze() {
    console.log('=== SOLVE MAZE CLICKED ===');
    console.log('Current algorithm:', selectedAlgorithm);
    console.log('Is animating:', isAnimating);
    
    if (isAnimating) {
        console.log('Animation already in progress, ignoring click');
        return;
    }
    
    if (!selectedAlgorithm) {
        alert('Please select an algorithm first!');
        return;
    }
    
    isAnimating = true;
    console.log('Starting algorithm:', selectedAlgorithm);
    
    // Exit compare mode if active
    if (isCompareMode) {
        isCompareMode = false;
        document.getElementById('singleView').classList.remove('hidden');
        document.getElementById('compareGrid').classList.remove('active');
        const backButton = document.getElementById('backButton');
        if (backButton) backButton.classList.add('hidden');
    }
    
    resetVisualization();

    const speedSlider = document.getElementById('speedSlider');
    animationSpeed = parseInt(speedSlider.value);
    console.log('Animation speed:', animationSpeed);

    const startTime = performance.now();
    const color = COLORS[selectedAlgorithm];
    console.log('Algorithm color:', color);
    let result;

    // Update instanced mesh color based on algorithm
    if (instancedExploredMesh) {
        instancedExploredMesh.material.color.setHex(color);
        if (instancedExploredMesh.material.emissive) {
            instancedExploredMesh.material.emissive.setHex(color);
        }
    }

    try {
        console.log('Executing algorithm:', selectedAlgorithm);
        switch (selectedAlgorithm) {
            case 'BFS': 
                console.log('Running BFS...');
                result = await bfs(color);
                break;
            case 'DFS': 
                console.log('Running DFS...');
                result = await dfs(color);
                break;
            case 'A*': 
                console.log('Running A*...');
                result = await aStar(color);
                break;
            case 'GREEDY': 
                console.log('Running GREEDY...');
                result = await greedy(color);
                break;
            default:
                console.error('Unknown algorithm:', selectedAlgorithm);
                alert('Unknown algorithm: ' + selectedAlgorithm);
                isAnimating = false;
                return;
        }

        const timeTaken = Math.round(performance.now() - startTime);
        console.log('Algorithm complete!');
        console.log('Nodes explored:', result.explored.size);
        console.log('Path length:', result.path.length);
        console.log('Time taken:', timeTaken + 'ms');
        
        document.getElementById('statNodes').textContent = result.explored.size;
        document.getElementById('statPath').textContent = result.path.length;
        document.getElementById('statTime').textContent = timeTaken;
    } catch (error) {
        console.error('Error running algorithm:', error);
        alert('Error running algorithm: ' + error.message);
    } finally {
        isAnimating = false;
        console.log('=== ALGORITHM EXECUTION COMPLETE ===');
    }
}

// Algorithm implementations
async function bfs(color) {
    console.log('BFS Starting...');
    const explored = new Set();
    const queue = [{ ...START, parent: null }];
    const visited = new Set();
    visited.add(`${START.row},${START.col}`);
    let nodeCount = 0;

    while (queue.length > 0) {
        const current = queue.shift();
        const key = `${current.row},${current.col}`;

        if (!explored.has(key)) {
            explored.add(key);
            nodeCount++;
            if ((current.row !== START.row || current.col !== START.col) &&
                (current.row !== GOAL.row || current.col !== GOAL.col)) {
                console.log(`BFS: Exploring node ${nodeCount} at (${current.row},${current.col})`);
                addExploredCube(current.row, current.col, color);
                await sleep(Math.max(1, animationSpeed / 50));
            }
        }

        if (current.row === GOAL.row && current.col === GOAL.col) {
            const path = reconstructPath(current);
            console.log(`BFS: Found goal! Explored ${explored.size} nodes, path length ${path.length}`);
            await drawPath(path, color);
            return { explored, path };
        }

        const neighbors = getNeighbors(current);
        for (const neighbor of neighbors) {
            const nKey = `${neighbor.row},${neighbor.col}`;
            if (!visited.has(nKey)) {
                visited.add(nKey);
                queue.push({ ...neighbor, parent: current });
            }
        }
    }

    console.log('BFS: No path found');
    return { explored, path: [] };
}

async function dfs(color) {
    console.log('DFS Starting...');
    const explored = new Set();
    const stack = [{ ...START, parent: null }];
    const visited = new Set();
    let nodeCount = 0;

    while (stack.length > 0) {
        const current = stack.pop();
        const key = `${current.row},${current.col}`;

        if (visited.has(key)) continue;
        visited.add(key);
        
        explored.add(key);
        nodeCount++;
        
        if ((current.row !== START.row || current.col !== START.col) &&
            (current.row !== GOAL.row || current.col !== GOAL.col)) {
            console.log(`DFS: Exploring node ${nodeCount} at (${current.row},${current.col})`);
            addExploredCube(current.row, current.col, color);
            await sleep(Math.max(1, animationSpeed / 50));
        }

        if (current.row === GOAL.row && current.col === GOAL.col) {
            const path = reconstructPath(current);
            console.log(`DFS: Found goal! Explored ${explored.size} nodes, path length ${path.length}`);
            await drawPath(path, color);
            return { explored, path };
        }

        const neighbors = getNeighbors(current);
        for (const neighbor of neighbors) {
            const nKey = `${neighbor.row},${neighbor.col}`;
            if (!visited.has(nKey)) {
                stack.push({ ...neighbor, parent: current });
            }
        }
    }

    console.log('DFS: No path found');
    return { explored, path: [] };
}

// FIXED A* Algorithm with proper priority queue implementation
async function aStar(color) {
    console.log('A* algorithm starting...');
    const explored = new Set();
    const closedSet = new Set();
    const gScore = new Map();
    const fScore = new Map();
    const parentMap = new Map();
    
    // Priority queue using array (proper heap would be better but this works)
    const openSet = [];
    
    const startKey = `${START.row},${START.col}`;
    gScore.set(startKey, 0);
    fScore.set(startKey, manhattanDistance(START, GOAL));
    openSet.push({ ...START, f: fScore.get(startKey) });

    while (openSet.length > 0) {
        // Sort by f score (priority queue)
        openSet.sort((a, b) => a.f - b.f);
        const current = openSet.shift();
        const key = `${current.row},${current.col}`;

        // Skip if already processed
        if (closedSet.has(key)) continue;
        
        closedSet.add(key);
        explored.add(key);

        // Visualize explored node with ANIMATION
        if ((current.row !== START.row || current.col !== START.col) &&
            (current.row !== GOAL.row || current.col !== GOAL.col)) {
            console.log(`A* exploring node (${current.row},${current.col})`);
            addExploredCube(current.row, current.col, color);
            await sleep(Math.max(1, animationSpeed / 10));
        }

        // Goal reached
        if (current.row === GOAL.row && current.col === GOAL.col) {
            console.log(`A* found goal! Explored ${explored.size} nodes`);
            const path = reconstructPathFromMap(current, parentMap);
            await drawPath(path, color);
            return { explored, path };
        }

        // Process neighbors
        const neighbors = getNeighbors(current);
        for (const neighbor of neighbors) {
            const nKey = `${neighbor.row},${neighbor.col}`;

            if (closedSet.has(nKey)) continue;

            // Calculate tentative g score (cost from start)
            const currentG = gScore.get(key) || Infinity;
            const tentativeG = currentG + 1;

            // If this path is better than previous
            if (!gScore.has(nKey) || tentativeG < gScore.get(nKey)) {
                parentMap.set(nKey, current);
                gScore.set(nKey, tentativeG);
                const h = manhattanDistance(neighbor, GOAL);
                const f = tentativeG + h;
                fScore.set(nKey, f);

                // Add to open set if not already there
                const inOpenSet = openSet.some(n => n.row === neighbor.row && n.col === neighbor.col);
                if (!inOpenSet) {
                    openSet.push({ ...neighbor, f: f });
                }
            }
        }
    }

    return { explored, path: [] };
}

// FIXED Greedy Best-First Search - uses ONLY heuristic (h(n))
async function greedy(color) {
    console.log('Greedy algorithm starting...');
    const explored = new Set();
    const closedSet = new Set();
    const parentMap = new Map();
    
    // Priority queue sorted by heuristic only
    const openSet = [];
    
    const startKey = `${START.row},${START.col}`;
    openSet.push({ 
        ...START, 
        h: manhattanDistance(START, GOAL) 
    });

    while (openSet.length > 0) {
        // Sort by heuristic only (greedy choice)
        openSet.sort((a, b) => a.h - b.h);
        const current = openSet.shift();
        const key = `${current.row},${current.col}`;

        // Skip if already processed
        if (closedSet.has(key)) continue;
        
        closedSet.add(key);
        explored.add(key);

        // Visualize explored node with ANIMATION
        if ((current.row !== START.row || current.col !== START.col) &&
            (current.row !== GOAL.row || current.col !== GOAL.col)) {
            console.log(`Greedy exploring node (${current.row},${current.col})`);
            addExploredCube(current.row, current.col, color);
            await sleep(Math.max(1, animationSpeed / 10));
        }

        // Goal reached
        if (current.row === GOAL.row && current.col === GOAL.col) {
            console.log(`Greedy found goal! Explored ${explored.size} nodes`);
            const path = reconstructPathFromMap(current, parentMap);
            await drawPath(path, color);
            return { explored, path };
        }

        // Process neighbors
        const neighbors = getNeighbors(current);
        for (const neighbor of neighbors) {
            const nKey = `${neighbor.row},${neighbor.col}`;

            if (closedSet.has(nKey)) continue;

            // Calculate heuristic only (no cost tracking)
            if (!parentMap.has(nKey)) {
                parentMap.set(nKey, current);
                const h = manhattanDistance(neighbor, GOAL);
                openSet.push({ ...neighbor, h: h });
            }
        }
    }

    return { explored, path: [] };
}

// Helper functions
function addExploredCube(row, col, color) {
    const geometry = new THREE.BoxGeometry(0.7, 0.4, 0.7);
    const material = new THREE.MeshBasicMaterial({ 
        color: color, 
        transparent: true, 
        opacity: 0.8
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(col + 0.5, 0.2, row + 0.5);
    cube.castShadow = false;
    cube.receiveShadow = false;
    scene.add(cube);
    exploredMeshes.push(cube);
    
    // Create particle burst when exploring node
    if (effectsEnabled.particles && Math.random() > 0.7) {
        createParticleBurst(col + 0.5, 0.4, row + 0.5, color, 8);
    }
}

// Optimized version using instanced mesh for better performance
function addExploredCubeOptimized(row, col, color) {
    if (!instancedExploredMesh || exploredCount >= instancedExploredMesh.geometry.attributes.position.count) return;
    
    const matrix = new THREE.Matrix4();
    matrix.setPosition(col + 0.5, 0.2, row + 0.5);
    instancedExploredMesh.setMatrixAt(exploredCount, matrix);
    instancedExploredMesh.instanceMatrix.needsUpdate = true;
    instancedExploredMesh.count = exploredCount + 1;
    exploredCount++;
    
    // Create particle burst when exploring node
    if (effectsEnabled.particles && Math.random() > 0.7) {
        createParticleBurst(col + 0.5, 0.4, row + 0.5, color, 8);
    }
}

async function drawPath(path, color) {
    console.log(`Drawing path with ${path.length} nodes...`);
    for (let i = 0; i < path.length; i++) {
        const cell = path[i];
        if ((cell.row !== START.row || cell.col !== START.col) &&
            (cell.row !== GOAL.row || cell.col !== GOAL.col)) {
            const geometry = new THREE.SphereGeometry(0.35, 16, 16);
            const material = new THREE.MeshBasicMaterial({ 
                color: COLORS.path,
                emissive: COLORS.path,
                emissiveIntensity: 0.5
            });
            const sphere = new THREE.Mesh(geometry, material);
            sphere.position.set(cell.col + 0.5, 0.35, cell.row + 0.5);
            sphere.castShadow = false;
            sphere.receiveShadow = false;
            scene.add(sphere);
            pathMeshes.push(sphere);
            
            // Create particle trail along path
            if (effectsEnabled.particles) {
                createParticleBurst(cell.col + 0.5, 0.35, cell.row + 0.5, COLORS.path, 15);
            }
            
            // Add connection line between path nodes
            if (i > 0) {
                const prev = path[i - 1];
                const lineGeometry = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(prev.col + 0.5, 0.3, prev.row + 0.5),
                    new THREE.Vector3(cell.col + 0.5, 0.3, cell.row + 0.5)
                ]);
                const lineMaterial = new THREE.LineBasicMaterial({ 
                    color: COLORS.path, 
                    linewidth: 3,
                    transparent: true,
                    opacity: 0.8
                });
                const line = new THREE.Line(lineGeometry, lineMaterial);
                scene.add(line);
                pathMeshes.push(line);
            }
            
            await sleep(Math.max(1, animationSpeed / 20));
        }
    }
    
    // Goal reached - big particle explosion!
    if (effectsEnabled.particles && path.length > 0) {
        const goal = path[path.length - 1];
        createParticleBurst(goal.col + 0.5, 0.6, goal.row + 0.5, COLORS.goal, 100);
    }
    console.log('Path drawing complete!');
}

function getNeighbors(node) {
    const neighbors = [];
    const directions = [
        { row: -1, col: 0 },
        { row: 1, col: 0 },
        { row: 0, col: -1 },
        { row: 0, col: 1 }
    ];

    for (const dir of directions) {
        const newRow = node.row + dir.row;
        const newCol = node.col + dir.col;

        if (newRow >= 0 && newRow < GRID_SIZE &&
            newCol >= 0 && newCol < GRID_SIZE &&
            maze[newRow][newCol] === 0) {
            neighbors.push({ row: newRow, col: newCol });
        }
    }

    return neighbors;
}

function manhattanDistance(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function reconstructPath(node) {
    const path = [];
    let current = node;

    while (current !== null) {
        path.unshift({ row: current.row, col: current.col });
        current = current.parent;
    }

    return path;
}

function reconstructPathFromMap(node, parentMap) {
    const path = [];
    let current = node;
    let key = `${current.row},${current.col}`;

    while (current) {
        path.unshift({ row: current.row, col: current.col });
        current = parentMap.get(key);
        if (current) {
            key = `${current.row},${current.col}`;
        }
    }

    return path;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Initialize compare scenes for 2x2 grid
function initCompareScenes() {
    const algorithms = [
        { name: 'BFS', id: 'bfsCanvas', color: COLORS.BFS, fpsId: 'fpsBfs' },
        { name: 'DFS', id: 'dfsCanvas', color: COLORS.DFS, fpsId: 'fpsDfs' },
        { name: 'A*', id: 'astarCanvas', color: COLORS['A*'], fpsId: 'fpsAstar' },
        { name: 'GREEDY', id: 'greedyCanvas', color: COLORS.GREEDY, fpsId: 'fpsGreedy' }
    ];
    
    // Wait for next frame to ensure layout is computed
    requestAnimationFrame(() => {
        algorithms.forEach(algo => {
            const container = document.getElementById(algo.id);
            if (!container) return;
            
            // Clear container
            container.innerHTML = '';
            
            // Create scene
            const compareScene = new THREE.Scene();
            compareScene.background = new THREE.Color(COLORS.background);
            
            // Get computed size after layout
            const rect = container.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;
            
            // Create camera with proper aspect ratio
            const compareCamera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
            compareCamera.position.set(GRID_SIZE * 0.8, GRID_SIZE * 0.8, GRID_SIZE * 0.8);
            compareCamera.lookAt(GRID_SIZE / 2, 0, GRID_SIZE / 2);
            
            // Create renderer
            const compareRenderer = new THREE.WebGLRenderer({ antialias: true });
            compareRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            compareRenderer.setSize(width, height);
            compareRenderer.shadowMap.enabled = effectsEnabled.shadows;
            container.appendChild(compareRenderer.domElement);
            
            // Add bright lighting for clear visibility
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
            compareScene.add(ambientLight);
            
            const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
            keyLight.position.set(GRID_SIZE * 1.5, GRID_SIZE * 2, GRID_SIZE * 1.5);
            keyLight.castShadow = false;
            compareScene.add(keyLight);
            
            // Build maze in this scene
            buildCompareScene(compareScene, algo.color);
            
            // Store references
            compareScenes[algo.id] = compareScene;
            compareCameras[algo.id] = compareCamera;
            compareRenderers[algo.id] = compareRenderer;
            
            // Initialize FPS counter for this window
            compareFpsCounters[algo.id] = {
                lastTime: performance.now(),
                frames: 0,
                fps: 60,
                element: document.getElementById(algo.fpsId)
            };
            
            // Setup scroll controls for this canvas
            setupScrollControls(container, compareCamera, compareScene);
            
            // Animation loop for this scene with FPS counter
            const animateCompare = () => {
                compareAnimationFrames[algo.id] = requestAnimationFrame(animateCompare);
                
                // Update FPS counter
                if (fpsEnabled && compareFpsCounters[algo.id]) {
                    const counter = compareFpsCounters[algo.id];
                    counter.frames++;
                    const currentTime = performance.now();
                    if (currentTime >= counter.lastTime + 1000) {
                        counter.fps = Math.round((counter.frames * 1000) / (currentTime - counter.lastTime));
                        if (counter.element) {
                            counter.element.textContent = `FPS: ${counter.fps}`;
                        }
                        counter.frames = 0;
                        counter.lastTime = currentTime;
                    }
                }
                
                // Keep markers always visible (no pulsing)
                
                compareRenderer.render(compareScene, compareCamera);
            };
            animateCompare();
        });
    });
}

function buildCompareScene(compareScene, algorithmColor) {
    // Clear floor
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE),
        new THREE.MeshLambertMaterial({ 
            color: COLORS.floor
        })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(GRID_SIZE / 2, -0.5, GRID_SIZE / 2);
    floor.receiveShadow = false;
    compareScene.add(floor);
    
    // Grid
    const grid = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, 0x444466, 0x222233);
    grid.position.set(GRID_SIZE / 2, -0.49, GRID_SIZE / 2);
    compareScene.add(grid);
    
    // Walls
    const wallPositions = [];
    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            if (maze[row][col] === 1) {
                wallPositions.push({ x: col, z: row });
            }
        }
    }
    
    const wallGeometry = new THREE.BoxGeometry(1, 2, 1);
    const wallMaterial = new THREE.MeshLambertMaterial({ 
        color: COLORS.wall
    });
    const wallMesh = new THREE.InstancedMesh(wallGeometry, wallMaterial, wallPositions.length);
    wallMesh.castShadow = false;
    
    const matrix = new THREE.Matrix4();
    wallPositions.forEach((pos, i) => {
        matrix.setPosition(pos.x + 0.5, 1, pos.z + 0.5);
        wallMesh.setMatrixAt(i, matrix);
    });
    wallMesh.instanceMatrix.needsUpdate = true;
    compareScene.add(wallMesh);
    
    // Start marker - ALWAYS VISIBLE
    const startSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 16, 16),
        new THREE.MeshBasicMaterial({ 
            color: COLORS.start
        })
    );
    startSphere.position.set(START.col + 0.5, 0.6, START.row + 0.5);
    startSphere.renderOrder = 1000;
    startSphere.userData.isStart = true;
    compareScene.add(startSphere);
    
    // Goal marker - ALWAYS VISIBLE
    const goalSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 16, 16),
        new THREE.MeshBasicMaterial({ 
            color: COLORS.goal
        })
    );
    goalSphere.position.set(GOAL.col + 0.5, 0.6, GOAL.row + 0.5);
    goalSphere.renderOrder = 1000;
    goalSphere.userData.isGoal = true;
    compareScene.add(goalSphere);
}

function cleanupCompareScenes() {
    Object.keys(compareAnimationFrames).forEach(key => {
        cancelAnimationFrame(compareAnimationFrames[key]);
    });
    
    Object.keys(compareRenderers).forEach(key => {
        const renderer = compareRenderers[key];
        const container = document.getElementById(key);
        if (container && renderer.domElement.parentNode === container) {
            container.removeChild(renderer.domElement);
        }
        renderer.dispose();
    });
    
    Object.keys(compareScenes).forEach(key => {
        const scene = compareScenes[key];
        scene.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
    });
    
    compareScenes = {};
    compareRenderers = {};
    compareCameras = {};
    compareAnimationFrames = {};
    compareFpsCounters = {};
}

// Run algorithms in compare mode
async function runBFSInCompare(color, containerId) {
    const compareScene = compareScenes[containerId];
    return await runAlgorithmInScene(compareScene, 'BFS', color);
}

async function runDFSInCompare(color, containerId) {
    const compareScene = compareScenes[containerId];
    return await runAlgorithmInScene(compareScene, 'DFS', color);
}

async function runAStarInCompare(color, containerId) {
    const compareScene = compareScenes[containerId];
    return await runAlgorithmInScene(compareScene, 'A*', color);
}

async function runGreedyInCompare(color, containerId) {
    const compareScene = compareScenes[containerId];
    return await runAlgorithmInScene(compareScene, 'GREEDY', color);
}

async function runAlgorithmInScene(compareScene, algorithm, color) {
    const explored = new Set();
    let path = [];
    
    // Run the algorithm logic
    let result;
    switch (algorithm) {
        case 'BFS':
            result = await bfsLogic(explored, color, compareScene);
            break;
        case 'DFS':
            result = await dfsLogic(explored, color, compareScene);
            break;
        case 'A*':
            result = await astarLogic(explored, color, compareScene);
            break;
        case 'GREEDY':
            result = await greedyLogic(explored, color, compareScene);
            break;
    }
    
    // Draw path in compare scene
    if (result.path.length > 0) {
        await drawPathInScene(result.path, compareScene);
    }
    
    return result;
}

async function bfsLogic(explored, color, targetScene) {
    console.log('BFS (compare) starting...');
    const queue = [{ ...START, parent: null }];
    const visited = new Set();
    visited.add(`${START.row},${START.col}`);
    let nodeCount = 0;

    while (queue.length > 0) {
        const current = queue.shift();
        const key = `${current.row},${current.col}`;

        if (!explored.has(key)) {
            explored.add(key);
            nodeCount++;
            if ((current.row !== START.row || current.col !== START.col) &&
                (current.row !== GOAL.row || current.col !== GOAL.col)) {
                addExploredToScene(current.row, current.col, color, targetScene);
                await sleep(Math.max(1, animationSpeed / 100));
            }
        }

        if (current.row === GOAL.row && current.col === GOAL.col) {
            const path = reconstructPath(current);
            console.log(`BFS (compare): Found goal! Explored ${explored.size} nodes, path ${path.length}`);
            return { explored, path };
        }

        const neighbors = getNeighbors(current);
        for (const neighbor of neighbors) {
            const nKey = `${neighbor.row},${neighbor.col}`;
            if (!visited.has(nKey)) {
                visited.add(nKey);
                queue.push({ ...neighbor, parent: current });
            }
        }
    }

    return { explored, path: [] };
}

async function dfsLogic(explored, color, targetScene) {
    console.log('DFS (compare) starting...');
    const stack = [{ ...START, parent: null }];
    const visited = new Set();
    let nodeCount = 0;

    while (stack.length > 0) {
        const current = stack.pop();
        const key = `${current.row},${current.col}`;

        if (visited.has(key)) continue;
        visited.add(key);
        
        explored.add(key);
        nodeCount++;
        
        if ((current.row !== START.row || current.col !== START.col) &&
            (current.row !== GOAL.row || current.col !== GOAL.col)) {
            addExploredToScene(current.row, current.col, color, targetScene);
            await sleep(Math.max(1, animationSpeed / 100));
        }

        if (current.row === GOAL.row && current.col === GOAL.col) {
            const path = reconstructPath(current);
            console.log(`DFS (compare): Found goal! Explored ${explored.size} nodes, path ${path.length}`);
            return { explored, path };
        }

        const neighbors = getNeighbors(current);
        for (const neighbor of neighbors) {
            const nKey = `${neighbor.row},${neighbor.col}`;
            if (!visited.has(nKey)) {
                stack.push({ ...neighbor, parent: current });
            }
        }
    }

    return { explored, path: [] };
}

async function astarLogic(explored, color, targetScene) {
    console.log('A* (compare) starting...');
    const closedSet = new Set();
    const gScore = new Map();
    const fScore = new Map();
    const parentMap = new Map();
    const openSet = [];
    
    const startKey = `${START.row},${START.col}`;
    gScore.set(startKey, 0);
    fScore.set(startKey, manhattanDistance(START, GOAL));
    openSet.push({ ...START, f: fScore.get(startKey) });

    while (openSet.length > 0) {
        openSet.sort((a, b) => a.f - b.f);
        const current = openSet.shift();
        const key = `${current.row},${current.col}`;

        if (closedSet.has(key)) continue;
        
        closedSet.add(key);
        explored.add(key);

        if ((current.row !== START.row || current.col !== START.col) &&
            (current.row !== GOAL.row || current.col !== GOAL.col)) {
            console.log(`A* (compare) exploring (${current.row},${current.col})`);
            addExploredToScene(current.row, current.col, color, targetScene);
            await sleep(Math.max(1, animationSpeed / 10));
        }

        if (current.row === GOAL.row && current.col === GOAL.col) {
            console.log(`A* (compare) found goal! Explored ${explored.size} nodes`);
            const path = reconstructPathFromMap(current, parentMap);
            return { explored, path };
        }

        const neighbors = getNeighbors(current);
        for (const neighbor of neighbors) {
            const nKey = `${neighbor.row},${neighbor.col}`;

            if (closedSet.has(nKey)) continue;

            const currentG = gScore.get(key) || Infinity;
            const tentativeG = currentG + 1;

            if (!gScore.has(nKey) || tentativeG < gScore.get(nKey)) {
                parentMap.set(nKey, current);
                gScore.set(nKey, tentativeG);
                const h = manhattanDistance(neighbor, GOAL);
                const f = tentativeG + h;
                fScore.set(nKey, f);

                const inOpenSet = openSet.some(n => n.row === neighbor.row && n.col === neighbor.col);
                if (!inOpenSet) {
                    openSet.push({ ...neighbor, f: f });
                }
            }
        }
    }

    return { explored, path: [] };
}

async function greedyLogic(explored, color, targetScene) {
    console.log('Greedy (compare) starting...');
    const closedSet = new Set();
    const parentMap = new Map();
    const openSet = [];
    
    const startKey = `${START.row},${START.col}`;
    openSet.push({ ...START, h: manhattanDistance(START, GOAL) });

    while (openSet.length > 0) {
        openSet.sort((a, b) => a.h - b.h);
        const current = openSet.shift();
        const key = `${current.row},${current.col}`;

        if (closedSet.has(key)) continue;
        
        closedSet.add(key);
        explored.add(key);

        if ((current.row !== START.row || current.col !== START.col) &&
            (current.row !== GOAL.row || current.col !== GOAL.col)) {
            console.log(`Greedy (compare) exploring (${current.row},${current.col})`);
            addExploredToScene(current.row, current.col, color, targetScene);
            await sleep(Math.max(1, animationSpeed / 10));
        }

        if (current.row === GOAL.row && current.col === GOAL.col) {
            console.log(`Greedy (compare) found goal! Explored ${explored.size} nodes`);
            const path = reconstructPathFromMap(current, parentMap);
            return { explored, path };
        }

        const neighbors = getNeighbors(current);
        for (const neighbor of neighbors) {
            const nKey = `${neighbor.row},${neighbor.col}`;

            if (closedSet.has(nKey)) continue;

            if (!parentMap.has(nKey)) {
                parentMap.set(nKey, current);
                const h = manhattanDistance(neighbor, GOAL);
                openSet.push({ ...neighbor, h: h });
            }
        }
    }

    return { explored, path: [] };
}

function addExploredToScene(row, col, color, targetScene) {
    const geometry = new THREE.BoxGeometry(0.7, 0.4, 0.7);
    const material = new THREE.MeshBasicMaterial({ 
        color: color, 
        transparent: true, 
        opacity: 0.8
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(col + 0.5, 0.2, row + 0.5);
    targetScene.add(cube);
}

async function drawPathInScene(path, targetScene) {
    console.log(`Drawing path in compare scene: ${path.length} nodes`);

    for (let i = 0; i < path.length; i++) {
        const cell = path[i];

        // Skip START and GOAL markers
        if (
            (cell.row === START.row && cell.col === START.col) ||
            (cell.row === GOAL.row && cell.col === GOAL.col)
        ) {
            continue;
        }

        // ----- PATH NODE SPHERE -----
        const geometry = new THREE.SphereGeometry(0.35, 16, 16);
        const material = new THREE.MeshBasicMaterial({
            color: COLORS.path,
            emissive: COLORS.path,
            emissiveIntensity: 0.7
        });

        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.set(cell.col + 0.5, 0.35, cell.row + 0.5);
        targetScene.add(sphere);

        // ----- DRAW LINE TO PREVIOUS NODE -----
        if (i > 0) {
            const prev = path[i - 1];

            const lineGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(prev.col + 0.5, 0.3, prev.row + 0.5),
                new THREE.Vector3(cell.col + 0.5, 0.3, cell.row + 0.5)
            ]);

            const lineMaterial = new THREE.LineBasicMaterial({
                color: COLORS.path,
                transparent: true,
                opacity: 0.9
            });

            const line = new THREE.Line(lineGeometry, lineMaterial);
            targetScene.add(line);
        }

        // Slow animation based on user slider
        await sleep(Math.max(1, animationSpeed / 20));
    }

    // 🎉 GOAL CELEBRATION
    if (effectsEnabled.particles && path.length > 0) {
        const goal = path[path.length - 1];
        createParticleBurst(
            goal.col + 0.5,
            0.6,
            goal.row + 0.5,
            COLORS.goal,
            80
        );
    }

    console.log("Compare-mode path drawing complete!");
}

// Initialize on load
window.addEventListener('load', () => {
    console.log('=== APPLICATION LOADING ===');
    initThreeJS();
    console.log('Three.js initialized');
    console.log('Initial maze generated');
    console.log('Default algorithm:', selectedAlgorithm);
    console.log('=== APPLICATION READY ===');
});

// Expose functions globally for HTML onclick handlers
window.selectAlgorithm = selectAlgorithm;
window.selectAlgorithmCard = selectAlgorithmCard;
window.changeDifficulty = changeDifficulty;
window.solveMaze = solveMaze;
window.compareAll = compareAll;
window.resetVisualization = resetVisualization;
window.generateNewMaze = generateNewMaze;
window.toggleSettings = toggleSettings;
window.toggleEffect = toggleEffect;
window.setQuality = setQuality;
window.updateSpeedValue = updateSpeedValue;