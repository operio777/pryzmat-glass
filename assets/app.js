const b=document.querySelector('.menu'),n=document.querySelector('.top nav'),d=document.querySelector('.top .nav-dropdown');b?.setAttribute('aria-expanded','false');b?.addEventListener('click',()=>{const open=n?.classList.toggle('open')??false;b.setAttribute('aria-expanded',String(open));if(!open&&d)d.open=false});n?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{n.classList.remove('open');b?.setAttribute('aria-expanded','false');if(d)d.open=false}));document.addEventListener('click',e=>{if(d?.open&&!d.contains(e.target))d.open=false});document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(d)d.open=false;n?.classList.remove('open');b?.setAttribute('aria-expanded','false')}});

// Measure the contact intent, not an email sent or a completed enquiry.
document.addEventListener('click', function (event) {
  const emailLink = event.target?.closest?.('a[href^="mailto:"]');
  if (!emailLink || !event.isTrusted || typeof window.gtag !== 'function') return;
  try {
    window.gtag('event', 'email_click', {
      send_to: 'G-3W2B2K7RCH',
      page_location: window.location.href,
      link_text: emailLink.textContent.trim()
    });
  } catch (_) {
    // A blocked or failing analytics tag must not interrupt the mailto link.
  }
});

// Keep the existing project video available without loading Facebook on page entry.
const videoButton = document.querySelector('#load-project-video');
videoButton?.addEventListener('click', function () {
  if (videoButton.disabled) return;
  const status = document.querySelector('#project-video-status');
  videoButton.disabled = true;
  status.textContent = 'Wczytywanie odtwarzacza…';
  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = 'https://connect.facebook.net/pl_PL/sdk.js#xfbml=1&version=v23.0';
  script.onload = function () {
    videoButton.hidden = true;
    status.textContent = 'Jeśli odtwarzacz się nie wyświetla, użyj linku do filmu na Facebooku.';
  };
  script.onerror = function () {
    status.textContent = 'Nie udało się wczytać odtwarzacza. Możesz otworzyć film na Facebooku lub spróbować ponownie.';
    videoButton.disabled = false;
    script.remove();
  };
  document.body.appendChild(script);
});
