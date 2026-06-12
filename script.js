// ==========================================================
    // CONFIGURAÇÕES
    // ==========================================================
    // As chaves abaixo agora são carregadas dinamicamente do Supabase.
    // SUPABASE_URL e SUPABASE_ANON_KEY permanecem fixas para inicialização.
    // ==========================================================

    let AGENT_NAME = "Verbum";
    let OPENROUTER_API_KEY = "";
    let OPENROUTER_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
    const SUPABASE_URL = "https://jqabfmdggybqgrgqhbkk.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_6W7GduPYMuwvZGUFkNU8Ig_WI2EEPll";
    let GOOGLE_DRIVE_API_KEY = "";
    let GOOGLE_DRIVE_FOLDER_ID = "";
    let EMBEDDING_MODEL = "openai/text-embedding-3-small";
    let MAX_HISTORY = 20;
    let TOP_K_RESULTS = 10;
    let TEMPERATURE = 0.4;

    // ==========================================================
    // SYSTEM PROMPT — PERSONALIDADE TEOLÓGICA REFORMADA
    // ==========================================================

    let SYSTEM_PROMPT = ""; // Loaded via fetch()

    // ==========================================================
    // ESTADO GLOBAL DA APLICAÇÃO
    // ==========================================================

    let currentUser = null;
    let currentConversation = null;
    let conversationMessages = [];
    let isProcessing = false;
    let isSyncing = false;
    let sb = null;
    const vectorSearchCache = new Map();

    // Three.js globals
    let sphereScene, sphereCamera, sphereRenderer, sphereParticles, sphereMaterial;
    let sphereAnimId = null;
    let targetSphereState = { speed: 0.3, turbulence: 0.06, scale: 1.0, color: new THREE.Color('#7B9FD4') };
    let currentSphereState = { speed: 0.3, turbulence: 0.06, scale: 1.0, color: new THREE.Color('#7B9FD4') };

    const SPHERE_STATES = {
      idle: { speed: 0.3, turbulence: 0.06, scale: 1.0, color: '#7B9FD4' },
      thinking: { speed: 1.8, turbulence: 0.28, scale: 1.08, color: '#9B7FD4' },
      responding: { speed: 0.7, turbulence: 0.10, scale: 1.03, color: '#7BD4A8' },
      error: { speed: 2.2, turbulence: 0.18, scale: 0.96, color: '#D47B7B' }
    };

    // bcryptjs global reference
    const bcrypt = dcodeIO.bcrypt;

    // pdf.js worker
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // marked.js configuration
    marked.setOptions({ breaks: true, gfm: true, headerIds: false, mangle: false });

    // ==========================================================
    // UTILITÁRIOS
    // ==========================================================

    function $(id) { return document.getElementById(id); }

    function formatDate(dateStr) {
      const d = new Date(dateStr);
      const now = new Date();
      const diff = now - d;
      if (diff < 60000) return 'Agora';
      if (diff < 3600000) return Math.floor(diff / 60000) + ' min';
      if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    }

    function simpleHash(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + c;
        hash |= 0;
      }
      return hash.toString();
    }

    function formatVector(arr) {
      return '[' + arr.join(',') + ']';
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function sleep(ms) {
      return new Promise(r => setTimeout(r, ms));
    }

    // ==========================================================
    // SUPABASE — INICIALIZAÇÃO E CONFIGURAÇÃO
    // ==========================================================

    async function fetchAppConfig() {
      if (!sb) return;
      try {
        const { data, error } = await sb.from('config').select('key, value');
        if (error) throw error;
        
        data.forEach(item => {
          switch (item.key) {
            case 'AGENT_NAME': AGENT_NAME = item.value; break;
            case 'OPENROUTER_API_KEY': OPENROUTER_API_KEY = item.value; break;
            case 'OPENROUTER_MODEL': OPENROUTER_MODEL = item.value; break;
            case 'GOOGLE_DRIVE_API_KEY': GOOGLE_DRIVE_API_KEY = item.value; break;
            case 'GOOGLE_DRIVE_FOLDER_ID': GOOGLE_DRIVE_FOLDER_ID = item.value; break;
            case 'EMBEDDING_MODEL': EMBEDDING_MODEL = item.value; break;
            case 'MAX_HISTORY': MAX_HISTORY = parseInt(item.value); break;
            case 'TOP_K_RESULTS': TOP_K_RESULTS = parseInt(item.value); break;
            case 'TEMPERATURE': TEMPERATURE = parseFloat(item.value); break;
          }
        });
        console.log('Configurações carregadas do Supabase');
      } catch (e) {
        console.error('Erro ao carregar configurações do Supabase:', e);
      }
    }

    function initSupabase() {
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        $('config-warning').style.display = 'block';
        return false;
      }
      try {
        sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return true;
      } catch (e) {
        console.error('Erro ao inicializar Supabase:', e);
        $('config-warning').style.display = 'block';
        return false;
      }
    }

    // ==========================================================
    // THREE.JS — ESFERA DE PARTÍCULAS
    // ==========================================================

    const VERTEX_SHADER = `
      uniform float uTime;
      uniform float uSpeed;
      uniform float uTurbulence;
      uniform float uScale;

      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;

      // 3D Simplex Noise (Ashima Arts)
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

      float snoise(vec3 v) {
        const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute(permute(permute(
          i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x2_ = x_ * ns.x + ns.yyyy;
        vec4 y2_ = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x2_) - abs(y2_);
        vec4 b0 = vec4(x2_.xy, y2_.xy);
        vec4 b1 = vec4(x2_.zw, y2_.zw);
        vec4 s0 = floor(b0) * 2.0 + 1.0;
        vec4 s1 = floor(b1) * 2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
      }

      void main() {
        vUv = uv;
        vNormal = normal;
        
        vec3 pos = position;
        
        // Fluid distortion for the solid mesh
        float noise = snoise(pos * 1.5 + uTime * uSpeed * 0.4);
        pos += normal * noise * uTurbulence * 1.5;
        
        // Pulse/Scale
        pos *= uScale;
        
        vPosition = pos;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `;

    const FRAGMENT_SHADER = `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uSpeed;

      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;

      void main() {
        // Cores do Google
        vec3 colorBlue = vec3(0.26, 0.52, 0.96);   // #4285F4
        vec3 colorRed = vec3(0.92, 0.26, 0.21);    // #EA4335
        vec3 colorYellow = vec3(0.98, 0.74, 0.02); // #FBBC05
        vec3 colorGreen = vec3(0.20, 0.66, 0.33);  // #34A853

        // Swirling coordinates
        vec3 p = vPosition * 1.5;
        float t = uTime * uSpeed * 0.5;
        
        // Mix factors using sin/cos waves based on position and time
        float mix1 = sin(p.x + t) * cos(p.y - t) * 0.5 + 0.5;
        float mix2 = sin(p.y + t * 1.2) * cos(p.z + t * 0.8) * 0.5 + 0.5;
        float mix3 = sin(p.z - t * 0.9) * cos(p.x + t * 1.1) * 0.5 + 0.5;

        // Combine colors
        vec3 col = mix(colorBlue, colorRed, mix1);
        col = mix(col, colorYellow, mix2);
        col = mix(col, colorGreen, mix3);

        // Mix 30% da cor de estado (uColor) para feedback visual
        col = mix(col, uColor, 0.3);

        // Fading edge for the "blurred orb" look
        vec3 viewDir = normalize(cameraPosition - vPosition);
        float fresnel = dot(viewDir, normalize(vNormal));
        
        // Fades out at the edges
        float alpha = smoothstep(0.0, 0.6, fresnel);
        
        // Dim the overall opacity slightly for a soft look
        alpha *= 0.85;

        gl_FragColor = vec4(col, alpha);
      }
    `;

    function createSphere(canvas) {
      const container = canvas.parentElement;
      const w = container.clientWidth || 280;
      const h = container.clientHeight || 280;

      sphereScene = new THREE.Scene();
      sphereCamera = new THREE.PerspectiveCamera(55, w / h, 0.1, 100);
      sphereCamera.position.z = 3.2;

      sphereRenderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
      sphereRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      sphereRenderer.setSize(w, h);
      sphereRenderer.setClearColor(0x000000, 0);

      // Create solid orb geometry
      const geometry = new THREE.IcosahedronGeometry(1.2, 64);

      sphereMaterial = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color('#7B9FD4') },
          uSpeed: { value: 0.3 },
          uTurbulence: { value: 0.06 },
          uScale: { value: 1.0 }
        },
        transparent: true,
        depthWrite: false
      });

      sphereParticles = new THREE.Mesh(geometry, sphereMaterial);
      sphereScene.add(sphereParticles);

      // Start animation loop
      if (sphereAnimId) cancelAnimationFrame(sphereAnimId);
      animateSphere();
    }

    function animateSphere() {
      sphereAnimId = requestAnimationFrame(animateSphere);

      const time = performance.now() * 0.001;
      sphereMaterial.uniforms.uTime.value = time;

      // Smooth lerp toward target state
      const lerp = 0.04;
      currentSphereState.speed += (targetSphereState.speed - currentSphereState.speed) * lerp;
      currentSphereState.turbulence += (targetSphereState.turbulence - currentSphereState.turbulence) * lerp;
      currentSphereState.scale += (targetSphereState.scale - currentSphereState.scale) * lerp;
      currentSphereState.color.lerp(targetSphereState.color, lerp);

      sphereMaterial.uniforms.uSpeed.value = currentSphereState.speed;
      sphereMaterial.uniforms.uTurbulence.value = currentSphereState.turbulence;
      sphereMaterial.uniforms.uScale.value = currentSphereState.scale;
      sphereMaterial.uniforms.uColor.value = currentSphereState.color;

      // Gentle rotation
      sphereParticles.rotation.y += 0.0015 * currentSphereState.speed;
      sphereParticles.rotation.x += 0.0008 * currentSphereState.speed;

      sphereRenderer.render(sphereScene, sphereCamera);
    }

    function setSphereState(stateName) {
      const s = SPHERE_STATES[stateName];
      if (!s) return;
      targetSphereState = {
        speed: s.speed,
        turbulence: s.turbulence,
        scale: s.scale,
        color: new THREE.Color(s.color)
      };
    }

    function resizeSphere() {
      const container = $('sphere-wrap');
      if (!container || !sphereRenderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      sphereCamera.aspect = w / h;
      sphereCamera.updateProjectionMatrix();
      sphereRenderer.setSize(w, h);
    }

    // ==========================================================
    // AUTENTICAÇÃO — REGISTRO / LOGIN
    // ==========================================================

    async function registerUser(name, password) {
      if (!name || name.length < 2) throw new Error('Nome deve ter pelo menos 2 caracteres.');
      if (!password || password.length < 4) throw new Error('Senha deve ter pelo menos 4 caracteres.');

      // Check if user exists
      const { data: existing } = await sb.from('users').select('id').eq('nome', name).maybeSingle();
      if (existing) throw new Error('Este nome já está em uso.');

      // Hash password
      const hash = await new Promise((resolve, reject) => {
        bcrypt.hash(password, 10, (err, h) => err ? reject(err) : resolve(h));
      });

      // Insert user
      const { data, error } = await sb.from('users').insert({ nome: name, senha_hash: hash }).select().single();
      if (error) throw new Error('Erro ao criar conta: ' + error.message);

      return data;
    }

    async function loginUser(name, password) {
      if (!name || !password) throw new Error('Preencha nome e senha.');

      const { data: user, error } = await sb.from('users').select('*').eq('nome', name).maybeSingle();
      if (error) throw new Error('Erro ao buscar usuário: ' + error.message);
      if (!user) throw new Error('Usuário não encontrado.');

      // Compare password
      const valid = await new Promise((resolve, reject) => {
        bcrypt.compare(password, user.senha_hash, (err, result) => err ? reject(err) : resolve(result));
      });

      if (!valid) throw new Error('Senha incorreta.');
      return user;
    }

    function saveSession(user) {
      localStorage.setItem('verbum_user', JSON.stringify({ id: user.id, nome: user.nome }));
    }

    function loadSession() {
      try {
        const s = localStorage.getItem('verbum_user');
        return s ? JSON.parse(s) : null;
      } catch { return null; }
    }

    function clearSession() {
      localStorage.removeItem('verbum_user');
    }

    // ==========================================================
    // UI — TRANSIÇÕES DE TELA
    // ==========================================================

    function showLogin() {
      $('login-screen').classList.remove('hidden');
      $('app-screen').style.display = 'none';
      $('app-screen').classList.remove('visible');

      // Move sphere to login
      $('login-sphere-anchor').appendChild($('sphere-wrap'));
      setTimeout(resizeSphere, 50);
    }

    function showApp() {
      $('login-screen').classList.add('hidden');
      $('app-screen').style.display = 'flex';

      // Move sphere to app
      $('app-sphere-anchor').appendChild($('sphere-wrap'));
      setTimeout(() => {
        resizeSphere();
        $('app-screen').classList.add('visible');
      }, 50);

      // Update titles with AGENT_NAME
      $('app-title').textContent = AGENT_NAME;
    }

    function showAuthError(msg) {
      const el = $('auth-error');
      el.textContent = msg;
      setTimeout(() => { el.textContent = ''; }, 5000);
    }

    function toggleSidebar(open) {
      const sidebar = $('sidebar');
      const overlay = $('sidebar-overlay');
      if (open) {
        sidebar.classList.add('open');
        overlay.classList.add('visible');
      } else {
        sidebar.classList.remove('open');
        overlay.classList.remove('visible');
      }
    }

    // ==========================================================
    // CONVERSAS — CRUD
    // ==========================================================

    async function loadConversations() {
      if (!sb || !currentUser) return [];
      const { data, error } = await sb
        .from('conversations')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('criado_em', { ascending: false });
      if (error) { console.error('Erro ao carregar conversas:', error); return []; }
      return data || [];
    }

    async function createConversation() {
      const { data, error } = await sb
        .from('conversations')
        .insert({ user_id: currentUser.id, titulo: 'Nova Conversa' })
        .select()
        .single();
      if (error) { console.error('Erro ao criar conversa:', error); return null; }
      return data;
    }

    async function updateConversationTitle(convId, firstMessage) {
      const titulo = firstMessage.substring(0, 60) + (firstMessage.length > 60 ? '...' : '');
      await sb.from('conversations').update({ titulo }).eq('id', convId);
    }

    async function loadMessages(convId) {
      const { data, error } = await sb
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('criado_em', { ascending: true });
      if (error) { console.error('Erro ao carregar mensagens:', error); return []; }
      return data || [];
    }

    async function saveMessage(convId, role, conteudo) {
      const { data, error } = await sb
        .from('messages')
        .insert({ conversation_id: convId, role, conteudo })
        .select()
        .single();
      if (error) console.error('Erro ao salvar mensagem:', error);
      return data;
    }

    // ==========================================================
    // UI — RENDERIZAÇÃO DE CONVERSAS E MENSAGENS
    // ==========================================================

    function renderConversationsList(conversations) {
      const list = $('conversations-list');
      list.innerHTML = '';

      if (conversations.length === 0) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:0.85rem;">Nenhuma conversa ainda</div>';
        return;
      }

      conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = 'conv-item' + (currentConversation && currentConversation.id === conv.id ? ' active' : '');
        item.innerHTML = `
          <div class="conv-item-icon">💬</div>
          <div class="conv-item-text">
            <div class="conv-item-title">${escapeHtml(conv.titulo)}</div>
            <div class="conv-item-date">${formatDate(conv.criado_em)}</div>
          </div>
        `;
        item.addEventListener('click', () => switchConversation(conv));
        list.appendChild(item);
      });
    }

    async function switchConversation(conv) {
      currentConversation = conv;
      conversationMessages = await loadMessages(conv.id);
      renderMessages();
      toggleSidebar(false);

      // Ensure sphere is always in app-sphere-anchor
      setTimeout(() => {
        const sphereWrap = $('sphere-wrap');
        const appAnchor = $('app-sphere-anchor');
        if (sphereWrap && appAnchor && !appAnchor.contains(sphereWrap)) {
          appAnchor.appendChild(sphereWrap);
          resizeSphere();
        }
      }, 50);

      // Update active state in sidebar
      const convs = await loadConversations();
      renderConversationsList(convs);
    }

    function renderMessages() {
      const container = $('chat-messages');
      const mainContent = $('main-content');
      container.innerHTML = '';

      if (conversationMessages.length === 0) {
        mainContent.classList.add('empty-chat');
        container.innerHTML = `
          <div class="welcome-hint" id="welcome-hint">
            <strong>Soli Deo Gloria</strong><br>
            Faça uma pergunta teológica fundamentada nas Escrituras e na tradição reformada.
          </div>
        `;
        // Recover sphere to the center anchor for empty state
        const sphereWrap = $('sphere-wrap');
        const appAnchor = $('app-sphere-anchor');
        if (sphereWrap && appAnchor) {
          appAnchor.appendChild(sphereWrap);
          setTimeout(resizeSphere, 10);
        }
        return;
      }

      mainContent.classList.remove('empty-chat');

      conversationMessages.forEach(msg => {
        appendMessageBubble(msg.role, msg.conteudo, false);
      });

      scrollToBottom(true);

      // Ensure sphere is always in app-sphere-anchor even with messages
      const sphereWrap = $('sphere-wrap');
      const appAnchor = $('app-sphere-anchor');
      if (sphereWrap && appAnchor && !appAnchor.contains(sphereWrap)) {
        appAnchor.appendChild(sphereWrap);
        setTimeout(resizeSphere, 10);
      }
    }

    function appendMessageBubble(role, content, animate = true) {
      // Remove welcome hint if present
      const hint = $('welcome-hint');
      if (hint) hint.remove();

      $('main-content').classList.remove('empty-chat');

      const container = $('chat-messages');
      const wrapper = document.createElement('div');
      wrapper.className = 'message message-' + role;
      if (!animate) wrapper.style.animation = 'none';

      let labelHtml = '';
      if (role === 'user') {
        labelHtml = '<div class="message-label">Você</div>';
      } else {
        labelHtml = '<div class="message-label agent-logo">' + AGENT_NAME + '</div>';
      }

      const bubble = document.createElement('div');
      bubble.className = 'message-bubble';

      if (role === 'assistant') {
        bubble.innerHTML = '<div class="msg-content">' + marked.parse(content) + '</div>';
      } else {
        bubble.textContent = content;
      }

      const actions = document.createElement('div');
      actions.className = 'message-actions';
      if (role === 'user') {
        actions.innerHTML = `
          <button class="action-btn" title="Editar"><i class="fa-solid fa-pen"></i></button>
          <button class="action-btn" title="Copiar"><i class="fa-regular fa-copy"></i></button>
        `;
      } else {
        actions.innerHTML = `
          <button class="action-btn" title="Copiar"><i class="fa-regular fa-copy"></i></button>
          <button class="action-btn" title="Reenviar/Gerar Novamente"><i class="fa-solid fa-rotate-right"></i></button>
        `;
      }

      if (role === 'assistant') {
        const avatarWrap = document.createElement('div');
        avatarWrap.className = 'message-avatar';
        avatarWrap.innerHTML = '<div class="message-avatar-fallback">' + AGENT_NAME.charAt(0) + '</div>';

        const contentWrap = document.createElement('div');
        contentWrap.className = 'message-content-wrapper';
        contentWrap.innerHTML = labelHtml;
        contentWrap.appendChild(bubble);
        contentWrap.appendChild(actions);

        wrapper.appendChild(avatarWrap);
        wrapper.appendChild(contentWrap);
      } else {
        const contentWrap = document.createElement('div');
        contentWrap.className = 'message-content-wrapper';
        contentWrap.innerHTML = labelHtml;
        contentWrap.appendChild(bubble);
        contentWrap.appendChild(actions);
        wrapper.appendChild(contentWrap);
      }

      container.appendChild(wrapper);

      return bubble;
    }

    function createStreamingBubble() {
      const hint = $('welcome-hint');
      if (hint) hint.remove();

      const container = $('chat-messages');
      const wrapper = document.createElement('div');
      wrapper.className = 'message message-assistant';

      const avatarWrap = document.createElement('div');
      avatarWrap.className = 'message-avatar';
      // Keep sphere in app-sphere-anchor, just use avatar fallback
      avatarWrap.innerHTML = '<div class="message-avatar-fallback">' + AGENT_NAME.charAt(0) + '</div>';

      const contentWrap = document.createElement('div');
      contentWrap.className = 'message-content-wrapper';
      contentWrap.innerHTML = '<div class="message-label agent-logo">' + AGENT_NAME + '</div>';

      const bubble = document.createElement('div');
      bubble.className = 'message-bubble';
      bubble.innerHTML = '<div class="msg-content"><div class="loading-dots"><span></span><span></span><span></span></div></div>';

      const actions = document.createElement('div');
      actions.className = 'message-actions';
      actions.innerHTML = `
        <button class="action-btn" title="Copiar"><i class="fa-regular fa-copy"></i></button>
        <button class="action-btn" title="Reenviar/Gerar Novamente"><i class="fa-solid fa-rotate-right"></i></button>
      `;

      contentWrap.appendChild(bubble);
      contentWrap.appendChild(actions);

      wrapper.appendChild(avatarWrap);
      wrapper.appendChild(contentWrap);
      container.appendChild(wrapper);

      return bubble;
    }

    function scrollToBottom(force = false) {
      const section = $('chat-section');
      if (!section) return;
      const isNearBottom = section.scrollHeight - section.scrollTop - section.clientHeight < 150;

      if (force || isNearBottom) {
        requestAnimationFrame(() => {
          section.scrollTop = section.scrollHeight;
        });
      }
    }

    // ==========================================================
    // EMBEDDINGS — GERAÇÃO VIA OPENROUTER
    // ==========================================================

    async function generateEmbedding(text) {
      if (!OPENROUTER_API_KEY || !EMBEDDING_MODEL) {
        throw new Error('Configure OPENROUTER_API_KEY e EMBEDDING_MODEL.');
      }

      const truncated = text.substring(0, 8000);

      const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + OPENROUTER_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: truncated
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error('Erro ao gerar embedding: ' + (err.error?.message || response.statusText));
      }

      const data = await response.json();
      return data.data[0].embedding;
    }

    // ==========================================================
    // GOOGLE DRIVE — LISTAGEM E DOWNLOAD
    // ==========================================================

    async function listDriveFiles() {
      if (!GOOGLE_DRIVE_API_KEY || !GOOGLE_DRIVE_FOLDER_ID) {
        throw new Error('Configure GOOGLE_DRIVE_API_KEY e GOOGLE_DRIVE_FOLDER_ID.');
      }

      let allFiles = [];
      let pageToken = '';

      do {
        let url = 'https://www.googleapis.com/drive/v3/files?' +
          'q=' + encodeURIComponent("'" + GOOGLE_DRIVE_FOLDER_ID + "' in parents and trashed=false") +
          '&key=' + GOOGLE_DRIVE_API_KEY +
          '&fields=' + encodeURIComponent('nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum,size)') +
          '&pageSize=100';

        if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);

        const response = await fetch(url);
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error('Erro ao listar arquivos do Drive: ' + (err.error?.message || response.statusText));
        }

        const data = await response.json();
        allFiles = allFiles.concat(data.files || []);
        pageToken = data.nextPageToken || '';
      } while (pageToken);

      // Filter supported file types
      const supported = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/markdown'
      ];

      return allFiles.filter(f => supported.includes(f.mimeType) || f.name.endsWith('.md') || f.name.endsWith('.txt'));
    }

    async function downloadDriveFile(fileId) {
      const url = 'https://www.googleapis.com/drive/v3/files/' + fileId +
        '?alt=media&key=' + GOOGLE_DRIVE_API_KEY;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Erro ao baixar arquivo: ' + response.statusText);
      return await response.arrayBuffer();
    }

    // ==========================================================
    // EXTRAÇÃO DE TEXTO — PDF, DOCX, TXT/MD
    // ==========================================================

    async function extractTextFromPDF(arrayBuffer) {
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        fullText += pageText + '\n\n';
      }

      return fullText.trim();
    }

    async function extractTextFromDOCX(arrayBuffer) {
      const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
      return result.value.trim();
    }

    function extractTextFromPlain(arrayBuffer) {
      const decoder = new TextDecoder('utf-8');
      return decoder.decode(arrayBuffer).trim();
    }

    async function extractText(arrayBuffer, mimeType, fileName) {
      if (mimeType === 'application/pdf') {
        return await extractTextFromPDF(arrayBuffer);
      } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        return await extractTextFromDOCX(arrayBuffer);
      } else {
        return extractTextFromPlain(arrayBuffer);
      }
    }

    // ==========================================================
    // CHUNKING — FRAGMENTAÇÃO DE TEXTO
    // ==========================================================

    function chunkText(text, maxChunkSize = 1500, overlapSize = 250) {
      const chunks = [];
      const paragraphs = text.split(/\n\s*\n/);
      let currentChunk = '';

      for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) continue;

        // If adding this paragraph exceeds the limit, save current chunk
        if (currentChunk.length > 0 && (currentChunk.length + trimmed.length + 2) > maxChunkSize) {
          chunks.push(currentChunk.trim());

          // Keep overlap from end of current chunk
          const words = currentChunk.split(/\s+/);
          const overlapWordCount = Math.floor(overlapSize / 5);
          const overlapWords = words.slice(-overlapWordCount);
          currentChunk = overlapWords.join(' ') + '\n\n' + trimmed;
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
        }
      }

      // Save remaining chunk
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }

      // Handle case where text has no paragraph breaks
      if (chunks.length === 0 && text.trim().length > 0) {
        const cleanText = text.trim();
        for (let i = 0; i < cleanText.length; i += maxChunkSize - overlapSize) {
          chunks.push(cleanText.substring(i, i + maxChunkSize).trim());
        }
      }

      return chunks.filter(c => c.length > 20);
    }

    // ==========================================================
    // SINCRONIZAÇÃO — INDEXAÇÃO DA BASE DE CONHECIMENTO
    // ==========================================================

    async function syncKnowledgeBase() {
      if (isSyncing) return;
      isSyncing = true;

      const syncBar = $('sync-bar');
      const syncFill = $('sync-fill');
      const syncStatus = $('sync-status');
      const syncBtn = $('sync-btn');

      syncBar.classList.add('active');
      syncBtn.classList.add('syncing');
      setSphereState('thinking');

      try {
        // 1. List files from Google Drive
        syncStatus.textContent = 'Listando arquivos do Drive...';
        syncFill.style.width = '5%';
        const driveFiles = await listDriveFiles();

        if (driveFiles.length === 0) {
          syncStatus.textContent = 'Nenhum arquivo encontrado na pasta.';
          await sleep(2000);
          return;
        }

        // 2. Get already indexed documents from Supabase
        const { data: existingDocs } = await sb.from('documents').select('*');
        const existingMap = new Map();
        (existingDocs || []).forEach(doc => existingMap.set(doc.drive_file_id, doc));

        // 3. Determine which files need processing
        const toProcess = [];
        for (const file of driveFiles) {
          const existing = existingMap.get(file.id);
          const fileHash = file.md5Checksum || file.modifiedTime;
          if (!existing || existing.hash !== fileHash) {
            toProcess.push({ ...file, fileHash });
          }
        }

        if (toProcess.length === 0) {
          syncStatus.textContent = 'Base de conhecimento já está atualizada.';
          syncFill.style.width = '100%';
          await sleep(2000);
          return;
        }

        syncStatus.textContent = `Processando ${toProcess.length} arquivo(s)...`;

        // 4. Process each file
        for (let i = 0; i < toProcess.length; i++) {
          const file = toProcess[i];
          const progress = 10 + ((i / toProcess.length) * 85);
          syncFill.style.width = progress + '%';
          syncStatus.textContent = `Processando ${i + 1}/${toProcess.length}: ${file.name}`;

          try {
            // Download file
            const buffer = await downloadDriveFile(file.id);

            // Extract text
            const text = await extractText(buffer, file.mimeType, file.name);
            if (!text || text.length < 10) {
              console.warn('Texto muito curto, pulando:', file.name);
              continue;
            }

            // Chunk text
            const chunks = chunkText(text);

            // Upsert document record
            const existingDoc = existingMap.get(file.id);
            let docId;

            if (existingDoc) {
              // Update existing document
              await sb.from('documents').update({
                nome: file.name,
                hash: file.fileHash,
                atualizado_em: new Date().toISOString()
              }).eq('id', existingDoc.id);
              docId = existingDoc.id;

              // Delete old chunks
              await sb.from('document_chunks').delete().eq('document_id', docId);
            } else {
              // Insert new document
              const { data: newDoc, error: docErr } = await sb.from('documents').insert({
                nome: file.name,
                drive_file_id: file.id,
                hash: file.fileHash
              }).select().single();

              if (docErr) { console.error('Erro ao inserir documento:', docErr); continue; }
              docId = newDoc.id;
            }

            // Generate embeddings and insert chunks (in batches)
            for (let j = 0; j < chunks.length; j++) {
              syncStatus.textContent = `${file.name} — chunk ${j + 1}/${chunks.length}`;

              try {
                const embedding = await generateEmbedding(chunks[j]);
                await sb.from('document_chunks').insert({
                  document_id: docId,
                  conteudo: chunks[j],
                  embedding: formatVector(embedding)
                });
              } catch (embErr) {
                console.error('Erro no chunk', j, 'de', file.name, ':', embErr);
              }

              // Small delay to avoid rate limiting
              if (j < chunks.length - 1) await sleep(300);
            }

          } catch (fileErr) {
            console.error('Erro ao processar', file.name, ':', fileErr);
          }
        }

        syncFill.style.width = '100%';
        syncStatus.textContent = 'Sincronização concluída!';
        await sleep(2000);

      } catch (err) {
        console.error('Erro na sincronização:', err);
        syncStatus.textContent = 'Erro: ' + err.message;
        setSphereState('error');
        await sleep(3000);
      } finally {
        syncBar.classList.remove('active');
        syncBtn.classList.remove('syncing');
        syncFill.style.width = '0%';
        setSphereState('idle');
        isSyncing = false;
      }
    }

    // ==========================================================
    // RAG — BUSCA VETORIAL + REORDENAÇÃO + CONTEXTO
    // ==========================================================

    async function searchDocumentChunks(queryEmbedding) {
      const cacheKey = simpleHash(queryEmbedding.slice(0, 10).join(','));
      if (vectorSearchCache.has(cacheKey)) {
        return vectorSearchCache.get(cacheKey);
      }

      const { data, error } = await sb.rpc('match_document_chunks', {
        query_embedding: queryEmbedding,
        match_count: TOP_K_RESULTS,
        similarity_threshold: 0.4
      });

      if (error) {
        console.error('Erro na busca vetorial de documentos:', error);
        return [];
      }

      const results = data || [];
      vectorSearchCache.set(cacheKey, results);
      return results;
    }

    async function searchMemories(queryEmbedding) {
      if (!currentUser) return [];

      const { data, error } = await sb.rpc('match_memories', {
        query_embedding: queryEmbedding,
        p_user_id: currentUser.id,
        match_count: 5
      });

      if (error) {
        console.error('Erro na busca de memórias:', error);
        return [];
      }

      return data || [];
    }

    async function enrichDocumentResults(chunks) {
      if (chunks.length === 0) return chunks;

      // Get document names for each chunk
      const docIds = [...new Set(chunks.map(c => c.document_id))];
      const { data: docs } = await sb
        .from('documents')
        .select('id, nome')
        .in('id', docIds);

      const docMap = new Map();
      (docs || []).forEach(d => docMap.set(d.id, d.nome));

      return chunks.map(c => ({
        ...c,
        document_name: docMap.get(c.document_id) || 'Documento desconhecido'
      }));
    }

    function buildContext(memories, documents, conversationHistory) {
      let context = '';

      // Add memories
      if (memories.length > 0) {
        context += '## Memórias de Conversas Anteriores\n';
        memories.forEach((m, i) => {
          context += `[Memória ${i + 1} — similaridade: ${(m.similarity * 100).toFixed(0)}%]\n${m.conteudo}\n\n`;
        });
      }

      // Add document chunks, sorted by similarity (already sorted from RPC)
      if (documents.length > 0) {
        context += '## Documentos da Base de Conhecimento\n';
        documents.forEach((d, i) => {
          context += `[Documento: "${d.document_name}" — similaridade: ${(d.similarity * 100).toFixed(0)}%]\n${d.conteudo}\n\n`;
        });
      }

      return context;
    }

    function buildMessages(userQuery, ragContext, history) {
      const messages = [];

      // System prompt with RAG context
      let systemContent = SYSTEM_PROMPT;
      if (ragContext) {
        systemContent += '\n\n---\n\n# CONTEXTO DISPONÍVEL\n\n' + ragContext;
      }
      messages.push({ role: 'system', content: systemContent });

      // Conversation history (up to MAX_HISTORY)
      const recentHistory = history.slice(-MAX_HISTORY);
      recentHistory.forEach(msg => {
        messages.push({ role: msg.role, content: msg.conteudo });
      });

      // Current user query
      messages.push({ role: 'user', content: userQuery });

      return messages;
    }

    // ==========================================================
    // CHAT — STREAMING DE RESPOSTA
    // ==========================================================

    async function sendMessage() {
      const input = $('user-input');
      const query = input.value.trim();
      if (!query || isProcessing) return;

      // Capture the current conversation state locally
      const targetConvId = currentConversation.id;
      const targetConversation = currentConversation;
      
      isProcessing = true;
      input.value = '';
      input.style.height = 'auto';
      $('send-btn').disabled = true;

      // Display user message in UI immediately
      appendMessageBubble('user', query);
      scrollToBottom(true);

      // Add to local history for immediate feedback
      conversationMessages.push({ role: 'user', conteudo: query, criado_em: new Date().toISOString() });

      try {
        let finalConvId = targetConvId;
        
        // 1. Check if conversation is temporary (and create if needed)
        if (targetConvId === 'temp') {
          const newConv = await createConversation();
          finalConvId = newConv.id;
          
          // If the user is still on this "temp" conversation, update global state
          if (currentConversation.id === 'temp') {
            currentConversation = newConv;
          }
          targetConversation.id = finalConvId; // Update local reference too
        }

        // 2. Save user message to DB
        await saveMessage(finalConvId, 'user', query);

        // 3. Update conversation title if this is the first message
        const messagesInConv = await loadMessages(finalConvId);
        if (messagesInConv.length <= 1) { // 1 because we just saved user message
          updateConversationTitle(finalConvId, query);
        }

        // Set sphere to thinking
        setSphereState('thinking');

        // 4. Create streaming bubble in UI
        const bubble = createStreamingBubble();

        // 5. Generate query embedding & Search (RAG)
        let queryEmbedding;
        try {
          queryEmbedding = await generateEmbedding(query);
        } catch (embErr) {
          console.warn('Embedding generation failed:', embErr);
        }

        let memories = [];
        let documents = [];
        if (queryEmbedding) {
          const [memResults, docResults] = await Promise.all([
            searchMemories(queryEmbedding),
            searchDocumentChunks(queryEmbedding)
          ]);
          memories = memResults;
          documents = await enrichDocumentResults(docResults);
        }

        const ragContext = buildContext(memories, documents, conversationMessages);
        const apiMessages = buildMessages(query, ragContext, conversationMessages.slice(0, -1));

        // 6. Call OpenRouter with streaming
        setSphereState('responding');

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + OPENROUTER_API_KEY,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.href,
            'X-Title': AGENT_NAME
          },
          body: JSON.stringify({
            model: OPENROUTER_MODEL,
            messages: apiMessages,
            temperature: TEMPERATURE,
            stream: true
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || 'Erro na API: ' + response.status);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        let renderQueued = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              const token = parsed.choices?.[0]?.delta?.content;
              if (token) {
                fullResponse += token;

                // 7. Update UI ONLY if user is still on this conversation
                if (currentConversation.id === finalConvId && !renderQueued) {
                  renderQueued = true;
                  requestAnimationFrame(() => {
                    bubble.innerHTML = '<div class="msg-content">' + marked.parse(fullResponse) + '</div>';
                    renderQueued = false;
                    scrollToBottom();
                  });
                }
              }
            } catch (pErr) {}
          }
        }

        // Final UI sync
        if (currentConversation.id === finalConvId) {
          bubble.innerHTML = '<div class="msg-content">' + marked.parse(fullResponse) + '</div>';
          scrollToBottom(true);
        }

        // 8. BREAK RESPONSE INTO PARAGRAPHS AND SEND INCREMENTALLY
        const paragraphs = fullResponse
          .split(/\n\n+/)
          .map(p => p.trim())
          .filter(p => p.length > 0);

        // Remove streaming bubble first
        if (currentConversation.id === finalConvId) {
          const lastMessage = document.querySelectorAll('.message-assistant');
          if (lastMessage.length > 0) {
            lastMessage[lastMessage.length - 1].remove();
          }
        }

        // Send each paragraph as separate message
        for (let i = 0; i < paragraphs.length; i++) {
          const paragraph = paragraphs[i];
          
          // Only show in UI if still on same conversation
          if (currentConversation.id === finalConvId) {
            appendMessageBubble('assistant', paragraph, true);
            scrollToBottom(true);
            // Small delay between paragraphs for better UX
            if (i < paragraphs.length - 1) {
              await sleep(100);
            }
          }
          
          // Always save to database regardless of current view
          await saveMessage(finalConvId, 'assistant', paragraph);
        }

        // Update conversation history
        if (currentConversation.id === finalConvId) {
          conversationMessages.push(...paragraphs.map(p => ({
            role: 'assistant',
            conteudo: p,
            criado_em: new Date().toISOString()
          })));
        }
        
        saveMemory(query, fullResponse).catch(e => console.warn(e));

      } catch (err) {
        console.error('Erro no chat:', err);
        if (currentConversation.id === targetConvId) {
          setSphereState('error');
          // Update the bubble if it exists
          const assistantBubbles = document.querySelectorAll('.message-assistant .message-bubble');
          const lastBubble = assistantBubbles[assistantBubbles.length - 1];
          if (lastBubble) lastBubble.innerHTML = '<div class="msg-content" style="color:var(--error)">Erro: ' + escapeHtml(err.message) + '</div>';
        }
      } finally {
        // Reset processing state ONLY if we are still on the same conversation
        // (Actually we should probably use a more robust way to track multiple active conversations)
        if (currentConversation.id === targetConvId || targetConvId === 'temp') {
          isProcessing = false;
          $('send-btn').disabled = false;
          setSphereState('idle');
        }
        
        loadConversations().then(convs => renderConversationsList(convs));
      }
    }

    // ==========================================================
    // MEMÓRIA SEMÂNTICA — PERSISTÊNCIA
    // ==========================================================

    async function saveMemory(userQuery, assistantResponse) {
      if (!currentUser || !OPENROUTER_API_KEY) return;

      const memoryText = 'Pergunta: ' + userQuery + '\nResposta resumida: ' + assistantResponse.substring(0, 500);

      try {
        const embedding = await generateEmbedding(memoryText);
        await sb.from('memories').insert({
          user_id: currentUser.id,
          conteudo: memoryText,
          embedding: formatVector(embedding)
        });
      } catch (err) {
        console.warn('Falha ao salvar memória semântica:', err);
      }
    }

    // ==========================================================
    // EVENT LISTENERS
    // ==========================================================

    // Auth — Login
    $('btn-login').addEventListener('click', async () => {
      const name = $('auth-name').value.trim();
      const password = $('auth-password').value;
      const btn = $('btn-login');

      btn.disabled = true;
      btn.textContent = 'Entrando...';

      try {
        const user = await loginUser(name, password);
        currentUser = { id: user.id, nome: user.nome };
        saveSession(currentUser);
        await initApp();
      } catch (err) {
        showAuthError(err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Entrar';
      }
    });

    // Auth — Register
    $('btn-register').addEventListener('click', async () => {
      const name = $('auth-name').value.trim();
      const password = $('auth-password').value;
      const btn = $('btn-register');

      btn.disabled = true;
      btn.textContent = 'Criando conta...';

      try {
        const user = await registerUser(name, password);
        currentUser = { id: user.id, nome: user.nome };
        saveSession(currentUser);
        await initApp();
      } catch (err) {
        showAuthError(err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Criar Conta';
      }
    });

    // Auth — Enter key on password field
    $('auth-password').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        $('btn-login').click();
      }
    });

    // Sidebar
    $('menu-btn').addEventListener('click', () => toggleSidebar(true));
    $('close-sidebar-btn').addEventListener('click', () => toggleSidebar(false));
    $('sidebar-overlay').addEventListener('click', () => toggleSidebar(false));

    // New conversation
    $('new-conv-btn').addEventListener('click', async () => {
      // Don't spam DB, just create temporary local conversation
      currentConversation = { id: 'temp', titulo: 'Nova Conversa', user_id: currentUser.id };
      conversationMessages = [];
      renderMessages();
      toggleSidebar(false);
      $('user-input').focus();
    });

    // Logout
    $('logout-btn').addEventListener('click', () => {
      clearSession();
      currentUser = null;
      currentConversation = null;
      conversationMessages = [];
      showLogin();
    });

    // Sync
    $('sync-btn').addEventListener('click', () => syncKnowledgeBase());

    // Settings Modal
    $('settings-btn').addEventListener('click', () => {
      $('model-select').value = OPENROUTER_MODEL;
      $('settings-modal').classList.add('active');
      toggleSidebar(false);
    });

    $('close-settings-btn').addEventListener('click', () => {
      $('settings-modal').classList.remove('active');
      $('settings-status').textContent = '';
    });

    $('save-settings-btn').addEventListener('click', async () => {
      const newModel = $('model-select').value;
      const status = $('settings-status');
      const btn = $('save-settings-btn');

      btn.disabled = true;
      status.textContent = 'Salvando no Supabase...';
      status.style.color = 'var(--text-secondary)';

      try {
        const { error } = await sb
          .from('config')
          .update({ value: newModel })
          .eq('key', 'OPENROUTER_MODEL');

        if (error) throw error;

        OPENROUTER_MODEL = newModel;
        status.textContent = 'Configuração salva com sucesso!';
        status.style.color = 'var(--success)';
        
        setTimeout(() => {
          $('settings-modal').classList.remove('active');
          status.textContent = '';
        }, 1500);
      } catch (err) {
        console.error('Erro ao salvar configuração:', err);
        status.textContent = 'Erro ao salvar: ' + err.message;
        status.style.color = 'var(--error)';
      } finally {
        btn.disabled = false;
      }
    });

    // Send message
    $('send-btn').addEventListener('click', () => sendMessage());

    // Input — auto-resize and Enter to send
    $('user-input').addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 150) + 'px';
    });

    $('user-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Window resize
    window.addEventListener('resize', resizeSphere);

    // ==========================================================
    // INICIALIZAÇÃO DA APLICAÇÃO
    // ==========================================================

    async function initApp() {
      showApp();

      // Load or create conversation
      const convs = await loadConversations();

      // Always create a temporary new conversation on load (Perplexity style)
      currentConversation = { id: 'temp', titulo: 'Nova Conversa', user_id: currentUser.id };
      conversationMessages = [];

      renderMessages();
      renderConversationsList(convs.length > 0 ? convs : [currentConversation]);

      // Focus input
      setTimeout(() => $('user-input').focus(), 300);
    }

    async function init() {
      try {
        const response = await fetch('system-prompt.md');
        if (response.ok) {
          SYSTEM_PROMPT = await response.text();
        } else {
          console.error('Falha ao carregar system-prompt.md');
        }
      } catch (e) {
        console.error('Erro de rede ao carregar system-prompt.md', e);
      }

      // Update login title with agent name
      $('login-title').textContent = AGENT_NAME;

      // Initialize sphere
      createSphere($('sphere-canvas'));
      $('login-sphere-anchor').appendChild($('sphere-wrap'));
      resizeSphere();

      // Initialize Supabase
      const supabaseReady = initSupabase();
      if (!supabaseReady) return;

      // Carregar configurações dinâmicas do banco de dados
      await fetchAppConfig();

      // Check for existing session
      const session = loadSession();
      if (session) {
        // Verify session is still valid
        try {
          const { data: user, error } = await sb.from('users').select('id, nome').eq('id', session.id).maybeSingle();
          if (user) {
            currentUser = { id: user.id, nome: user.nome };
            await initApp();
            return;
          }
        } catch (e) {
          console.warn('Sessão inválida, redirecionando para login');
        }
        clearSession();
      }

      // Show login
      showLogin();
    }

    // Start the application
    init();