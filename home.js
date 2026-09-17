// Tailwind Config Configuration
tailwind.config = {
    theme: {
        extend: {
            colors: {
                cream: '#F6F2EE',
                terracotta: '#b6653e',
                'terracotta-hover': '#98512e',
                'terracotta-soft': '#c47853',
                sage: '#4d513b',
                'sage-light': '#61664c',
                'charcoal-dark': '#221E1D',
                'muted-brown': '#726863',
            },
            fontFamily: {
                serif: ['Cormorant Garamond', 'serif'],
                sans: ['Plus Jakarta Sans', 'sans-serif'],
            }
        }
    }
};

// DOM Interactivity
document.addEventListener('DOMContentLoaded', () => {
    // Mobile Navigation Toggle
    const menuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');

    if (menuBtn && mobileMenu) {
        menuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });
    }

    // Scroll Observer for General Reveal Animations
    const observerOptions = {
        root: null,
        threshold: 0.12,
        rootMargin: '0px 0px -50px 0px'
    };

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

    // Reversible Door Observer
    const serviceCards = document.querySelectorAll('.service-card');
    const serviceDoorObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const card = entry.target;
            const cardIndex = parseInt(card.getAttribute('data-index') || '0');
            
            if (entry.isIntersecting) {
                const totalDelay = 1000 + (cardIndex * 600);
                card.doorTimeout = setTimeout(() => {
                    card.classList.add('doors-open');
                }, totalDelay);
            } else {
                if (card.doorTimeout) clearTimeout(card.doorTimeout);
                card.classList.remove('doors-open');
            }
        });
    }, {
        threshold: 0.25,
        rootMargin: '0px 0px -20px 0px'
    });

    serviceCards.forEach(card => serviceDoorObserver.observe(card));

    // Process Interactive Switcher
    const processImages = [
        "7.jpg",
        "6.jpg",
        "4.jpg", 
        "5.jpg",
        "8.jpg"
    ];

    const steps = document.querySelectorAll('.process-step');
    const imgElement = document.getElementById('process-image');

    steps.forEach((step, index) => {
        step.addEventListener('click', () => {
            steps.forEach(s => {
                s.classList.remove('border-terracotta', 'bg-white', 'shadow-md');
                s.classList.add('border-transparent', 'bg-white/60');
                const desc = s.querySelector('.step-desc');
                if (desc) desc.classList.add('hidden');
            });

            step.classList.add('border-terracotta', 'bg-white', 'shadow-md');
            step.classList.remove('border-transparent', 'bg-white/60');
            
            const desc = step.querySelector('.step-desc');
            if (desc) desc.classList.remove('hidden');

            if (imgElement) {
                imgElement.style.opacity = '0';
                setTimeout(() => {
                    imgElement.src = processImages[index];
                    imgElement.style.opacity = '1';
                }, 200);
            }
        });
    });
});


function switchHeroSlide(slideNumber) {
            // Update Text Content across Mobile and Desktop
            document.querySelectorAll('.slide-text').forEach(el => {
                if (parseInt(el.getAttribute('data-slide')) === slideNumber) {
                    el.classList.remove('hidden', 'opacity-0', 'translate-y-4');
                    el.classList.add('block', 'opacity-100', 'translate-y-0');
                } else {
                    el.classList.remove('block', 'opacity-100', 'translate-y-0');
                    el.classList.add('hidden', 'opacity-0', 'translate-y-4');
                }
            });

            // Update Main Slide Images
            document.querySelectorAll('.slide-img').forEach(el => {
                el.style.opacity = parseInt(el.getAttribute('data-slide')) === slideNumber ? '1' : '0';
            });

            // Update Arch Overlay Images (Desktop)
            document.querySelectorAll('.arch-img').forEach(el => {
                el.style.opacity = parseInt(el.getAttribute('data-slide')) === slideNumber ? '1' : '0';
            });

            // Update Side Tag Indicators (Mobile)
            document.querySelectorAll('.slide-tag').forEach(el => {
                if (parseInt(el.getAttribute('data-slide')) === slideNumber) {
                    el.classList.remove('hidden');
                } else {
                    el.classList.add('hidden');
                }
            });

            // Update Navigation Indicators
            document.querySelectorAll('.slide-nav').forEach(btn => {
                const num = btn.querySelector('.nav-num');
                const bar = btn.querySelector('.nav-bar');
                
                if (parseInt(btn.getAttribute('data-slide')) === slideNumber) {
                    if (num) num.className = 'nav-num text-charcoal-dark font-bold text-[11px] lg:text-xs';
                    if (bar) bar.classList.remove('hidden');
                } else {
                    if (num) num.className = 'nav-num text-stone-400 hover:text-charcoal-dark font-semibold text-[11px] lg:text-xs';
                    if (bar) bar.classList.add('hidden');
                }
            });
        }

        // Initialize to slide 1 on page load
        document.addEventListener('DOMContentLoaded', () => {
            switchHeroSlide(1);
        });