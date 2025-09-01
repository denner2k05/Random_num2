// Lucky Number - Animações Avançadas e Interações Dinâmicas

class LuckyNumberAnimations {
    constructor() {
        this.init();
    }

    init() {
        this.createParticleSystem();
        this.initScrollAnimations();
        this.initHoverEffects();
        this.initCounterAnimations();
        this.initTypewriterEffect();
        this.initFloatingElements();
        this.initSoundEffects();
        this.initProgressBars();
        this.initMorphingShapes();
    }

    // Sistema de partículas avançado
    createParticleSystem() {
        const canvas = document.createElement('canvas');
        canvas.id = 'particle-canvas';
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '-1';
        document.body.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        const particles = [];

        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }

        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.vx = (Math.random() - 0.5) * 2;
                this.vy = (Math.random() - 0.5) * 2;
                this.radius = Math.random() * 3 + 1;
                this.opacity = Math.random() * 0.5 + 0.2;
                this.color = `rgba(59, 130, 246, ${this.opacity})`;
            }

            update() {
                this.x += this.vx;
                this.y += this.vy;

                if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
                if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
            }

            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.fill();
            }
        }

        function createParticles() {
            for (let i = 0; i < 50; i++) {
                particles.push(new Particle());
            }
        }

        function animateParticles() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            particles.forEach(particle => {
                particle.update();
                particle.draw();
            });

            requestAnimationFrame(animateParticles);
        }

        resizeCanvas();
        createParticles();
        animateParticles();

        window.addEventListener('resize', resizeCanvas);
    }

    // Animações de scroll
    initScrollAnimations() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-in');
                }
            });
        }, { threshold: 0.1 });

        document.querySelectorAll('.step-card, .multiplier-card, .feature-card, .game-section').forEach(el => {
            observer.observe(el);
        });

        // Parallax effect
        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            const parallaxElements = document.querySelectorAll('.parallax');
            
            parallaxElements.forEach(element => {
                const speed = element.dataset.speed || 0.5;
                element.style.transform = `translateY(${scrolled * speed}px)`;
            });
        });
    }

    // Efeitos de hover avançados
    initHoverEffects() {
        // Efeito magnético nos botões
        document.querySelectorAll('.btn').forEach(btn => {
            btn.addEventListener('mousemove', (e) => {
                const rect = btn.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;
                
                btn.style.transform = `translate(${x * 0.1}px, ${y * 0.1}px) scale(1.05)`;
            });

            btn.addEventListener('mouseleave', () => {
                btn.style.transform = 'translate(0, 0) scale(1)';
            });
        });

        // Efeito de brilho nos cards
        document.querySelectorAll('.step-card, .multiplier-card, .feature-card').forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                card.style.setProperty('--mouse-x', x + 'px');
                card.style.setProperty('--mouse-y', y + 'px');
            });
        });
    }

    // Animações de contador
    initCounterAnimations() {
        const counters = document.querySelectorAll('.stat-number, .stat-value');
        
        const animateCounter = (element) => {
            const target = parseInt(element.textContent.replace(/[^\d]/g, ''));
            const duration = 2000;
            const start = performance.now();
            
            const animate = (currentTime) => {
                const elapsed = currentTime - start;
                const progress = Math.min(elapsed / duration, 1);
                
                const easeOutQuart = 1 - Math.pow(1 - progress, 4);
                const current = Math.floor(easeOutQuart * target);
                
                if (element.textContent.includes('R$')) {
                    element.textContent = 'R$ ' + current.toLocaleString();
                } else if (element.textContent.includes('%')) {
                    element.textContent = current + '%';
                } else {
                    element.textContent = current.toLocaleString();
                }
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                }
            };
            
            requestAnimationFrame(animate);
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    animateCounter(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        });

        counters.forEach(counter => observer.observe(counter));
    }

    // Efeito de máquina de escrever
    initTypewriterEffect() {
        const typewriterElements = document.querySelectorAll('.typewriter');
        
        typewriterElements.forEach(element => {
            const text = element.textContent;
            element.textContent = '';
            
            let i = 0;
            const typeWriter = () => {
                if (i < text.length) {
                    element.textContent += text.charAt(i);
                    i++;
                    setTimeout(typeWriter, 100);
                }
            };
            
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        typeWriter();
                        observer.unobserve(entry.target);
                    }
                });
            });
            
            observer.observe(element);
        });
    }

    // Elementos flutuantes
    initFloatingElements() {
        const floatingElements = document.querySelectorAll('.floating');
        
        floatingElements.forEach((element, index) => {
            const amplitude = 20;
            const frequency = 0.02;
            const offset = index * 0.5;
            
            const animate = () => {
                const time = Date.now() * frequency;
                const y = Math.sin(time + offset) * amplitude;
                element.style.transform = `translateY(${y}px)`;
                requestAnimationFrame(animate);
            };
            
            animate();
        });
    }

    // Efeitos sonoros (opcional)
    initSoundEffects() {
        const createAudioContext = () => {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            const playTone = (frequency, duration) => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.frequency.value = frequency;
                oscillator.type = 'sine';
                
                gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + duration);
            };
            
            return { playTone };
        };

        let audioSystem = null;

        // Som ao clicar em botões
        document.querySelectorAll('.btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!audioSystem) audioSystem = createAudioContext();
                audioSystem.playTone(800, 0.1);
            });
        });

        // Som ao selecionar range
        document.querySelectorAll('.range-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!audioSystem) audioSystem = createAudioContext();
                audioSystem.playTone(600, 0.15);
            });
        });
    }

    // Barras de progresso animadas
    initProgressBars() {
        const progressBars = document.querySelectorAll('.progress-bar');
        
        const animateProgressBar = (bar) => {
            const progress = bar.dataset.progress || 0;
            const fill = bar.querySelector('.progress-fill');
            
            let current = 0;
            const increment = progress / 100;
            
            const animate = () => {
                if (current < progress) {
                    current += increment;
                    fill.style.width = current + '%';
                    requestAnimationFrame(animate);
                }
            };
            
            animate();
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    animateProgressBar(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        });

        progressBars.forEach(bar => observer.observe(bar));
    }

    // Formas que se transformam
    initMorphingShapes() {
        const shapes = document.querySelectorAll('.morphing-shape');
        
        shapes.forEach(shape => {
            let morphState = 0;
            
            const morph = () => {
                morphState += 0.02;
                const scale = 1 + Math.sin(morphState) * 0.1;
                const rotation = Math.sin(morphState * 0.5) * 10;
                
                shape.style.transform = `scale(${scale}) rotate(${rotation}deg)`;
                requestAnimationFrame(morph);
            };
            
            morph();
        });
    }

    // Efeito de ondas ao clicar
    static createRippleEffect(element, event) {
        const ripple = document.createElement('span');
        const rect = element.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;
        
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        ripple.classList.add('ripple');
        
        element.appendChild(ripple);
        
        setTimeout(() => {
            ripple.remove();
        }, 600);
    }

    // Shake animation para erros
    static shakeElement(element) {
        element.classList.add('shake');
        setTimeout(() => {
            element.classList.remove('shake');
        }, 500);
    }

    // Pulse animation para sucessos
    static pulseElement(element) {
        element.classList.add('pulse');
        setTimeout(() => {
            element.classList.remove('pulse');
        }, 1000);
    }

    // Glow effect
    static glowElement(element, color = '#3B82F6') {
        element.style.boxShadow = `0 0 20px ${color}`;
        setTimeout(() => {
            element.style.boxShadow = '';
        }, 2000);
    }
}

// CSS para as animações
const animationStyles = `
<style>
.animate-in {
    animation: slideInUp 0.8s ease-out forwards;
}

@keyframes slideInUp {
    from {
        opacity: 0;
        transform: translateY(50px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.ripple {
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.6);
    transform: scale(0);
    animation: ripple-animation 0.6s linear;
    pointer-events: none;
}

@keyframes ripple-animation {
    to {
        transform: scale(4);
        opacity: 0;
    }
}

.shake {
    animation: shake 0.5s ease-in-out;
}

@keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
}

.pulse {
    animation: pulse 1s ease-in-out;
}

@keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
}

.step-card, .multiplier-card, .feature-card {
    position: relative;
    overflow: hidden;
}

.step-card::before, .multiplier-card::before, .feature-card::before {
    content: '';
    position: absolute;
    top: var(--mouse-y, 50%);
    left: var(--mouse-x, 50%);
    width: 200px;
    height: 200px;
    background: radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%);
    transform: translate(-50%, -50%);
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
}

.step-card:hover::before, .multiplier-card:hover::before, .feature-card:hover::before {
    opacity: 1;
}

.progress-bar {
    width: 100%;
    height: 8px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #3B82F6, #8B5CF6);
    border-radius: 4px;
    width: 0%;
    transition: width 0.3s ease;
}

.floating {
    animation: float 3s ease-in-out infinite;
}

@keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-10px); }
}

.morphing-shape {
    transition: transform 0.1s ease;
}

.typewriter {
    border-right: 2px solid #3B82F6;
    animation: blink 1s infinite;
}

@keyframes blink {
    0%, 50% { border-color: transparent; }
    51%, 100% { border-color: #3B82F6; }
}
</style>
`;

// Adicionar estilos ao documento
document.head.insertAdjacentHTML('beforeend', animationStyles);

// Inicializar animações quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    new LuckyNumberAnimations();
    
    // Adicionar efeito ripple a todos os botões
    document.querySelectorAll('.btn, .range-btn, .quick-bet-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            LuckyNumberAnimations.createRippleEffect(btn, e);
        });
    });
});

// Exportar para uso global
window.LuckyNumberAnimations = LuckyNumberAnimations;

