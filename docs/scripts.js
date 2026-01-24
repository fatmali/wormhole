// Wormhole Docs - Interactive Scripts

document.addEventListener('DOMContentLoaded', () => {
    // Smooth scroll for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Navbar background on scroll
    const navbar = document.querySelector('.navbar');
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;

        if (currentScroll > 100) {
            navbar.style.background = 'rgba(10, 10, 15, 0.95)';
            navbar.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
        } else {
            navbar.style.background = 'rgba(10, 10, 15, 0.8)';
            navbar.style.boxShadow = 'none';
        }

        lastScroll = currentScroll;
    });

    // Intersection Observer for fade-in animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Apply to sections and cards
    document.querySelectorAll('.section, .feature-card, .tool-card, .session-card, .install-step').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    // Add copy functionality to code blocks
    document.querySelectorAll('.code-block').forEach(block => {
        block.addEventListener('click', async () => {
            const code = block.querySelector('code');
            if (code) {
                try {
                    await navigator.clipboard.writeText(code.textContent);

                    // Visual feedback
                    const originalBg = block.style.borderColor;
                    block.style.borderColor = '#22c55e';

                    setTimeout(() => {
                        block.style.borderColor = originalBg;
                    }, 1000);
                } catch (err) {
                    console.error('Failed to copy:', err);
                }
            }
        });

        // Add cursor pointer to indicate clickable
        block.style.cursor = 'pointer';
        block.title = 'Click to copy';
    });

    // Parallax effect for background
    window.addEventListener('scroll', () => {
        const portal = document.querySelector('.wormhole-portal');
        if (portal) {
            const scrolled = window.pageYOffset;
            portal.style.transform = `translate(-50%, calc(-50% + ${scrolled * 0.1}px))`;
        }
    });

    // Add hover effects to agent nodes
    document.querySelectorAll('.agent-node').forEach(node => {
        node.addEventListener('mouseenter', () => {
            node.style.transform = 'scale(1.05)';
            node.style.boxShadow = '0 0 30px rgba(168, 85, 247, 0.4)';
        });

        node.addEventListener('mouseleave', () => {
            node.style.transform = 'scale(1)';
            node.style.boxShadow = 'none';
        });
    });

    // Typing animation for hero subtitle
    const subtitle = document.querySelector('.hero-subtitle');
    if (subtitle) {
        const text = subtitle.textContent;
        subtitle.textContent = '';
        subtitle.style.visibility = 'visible';

        let i = 0;
        const typeWriter = () => {
            if (i < text.length) {
                subtitle.textContent += text.charAt(i);
                i++;
                setTimeout(typeWriter, 50);
            }
        };

        // Start typing after a short delay
        setTimeout(typeWriter, 500);
    }

    console.log('🌀 Wormhole Docs loaded successfully!');
});
