document.addEventListener('DOMContentLoaded', () => {
  const commands = document.querySelectorAll('.terminal-body .text-cyber-cyan');
  
  commands.forEach((cmd) => {
    const commandText = cmd.textContent?.trim();
    if (commandText?.startsWith('$')) {
      const el = cmd as HTMLElement;
      el.style.cursor = 'pointer';
      el.title = 'Click to copy';
      
      el.addEventListener('click', async () => {
        const text = commandText.replace('$ ', '');
        try {
          await navigator.clipboard.writeText(text);
          const originalText = el.textContent;
          el.textContent = '✓ COPIED';
          el.classList.add('text-cyber-emerald');
          
          setTimeout(() => {
            el.textContent = originalText;
            el.classList.remove('text-cyber-emerald');
          }, 1500);
        } catch (err) {
          console.error('Failed to copy:', err);
        }
      });
    }
  });
  
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const el = entry.target as HTMLElement;
        el.classList.add('revealed');
        el.style.removeProperty('opacity');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { 
    threshold: 0.1, 
    rootMargin: '0px 0px -50px 0px' 
  });
  
  const revealElements = document.querySelectorAll('.reveal, .reveal-fade, .reveal-slide-up, .reveal-slide-left, .reveal-slide-right');
  revealElements.forEach((el) => {
    revealObserver.observe(el);
  });
});
