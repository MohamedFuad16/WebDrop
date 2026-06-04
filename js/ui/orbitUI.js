export class OrbitUI {
  constructor(containerElement) {
    this.container = containerElement;
    this.users = new Map();
  }

  updateUser(user) {
    this.users.set(user.id, user);
    let pill = this.container.querySelector(`[data-user-id="${user.id}"]`);
    
    if (!pill) {
      pill = document.createElement("article");
      pill.className = "user-pill";
      pill.dataset.userId = user.id;
      pill.innerHTML = `
        <span class="user-avatar" aria-hidden="true">${user.displayName.charAt(0).toUpperCase()}</span>
        <span class="user-name">${user.displayName}</span>
      `;
      this.container.appendChild(pill);
    }

    this.positionPill(pill, user);
  }

  removeUser(userId) {
    this.users.delete(userId);
    const pill = this.container.querySelector(`[data-user-id="${userId}"]`);
    if (pill) pill.remove();
  }

  positionPill(pill, user) {
    // Determine orbit level based on proximity score
    // 0-29: far (outermost), 30-39: orbit 3, 40-49: orbit 2, 50-69: orbit 1, 70+: innermost
    let orbitLevel = 0;
    if (user.proximityScore >= 70) orbitLevel = 3;
    else if (user.proximityScore >= 50) orbitLevel = 2;
    else if (user.proximityScore >= 40) orbitLevel = 1;
    else orbitLevel = 0;

    const radii = [410, 310, 210, 120]; // Map to our CSS orbit sizes (820px, 620px, 420px radii)
    const radius = radii[orbitLevel] || 410;
    
    // Convert to a simple fixed position for demo/skeleton
    // Real implementation would calculate based on index to spread users around the circle
    const angle = Array.from(this.users.keys()).indexOf(user.id) * (Math.PI * 2 / Math.max(1, this.users.size));
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;

    pill.style.setProperty("--pill-x", `calc(-50% + ${x}px)`);
    pill.style.setProperty("--pill-y", `calc(-50% + ${y}px)`);
    
    if (user.proximityScore >= 70) {
      pill.classList.add('ready-to-connect');
    } else {
      pill.classList.remove('ready-to-connect');
    }
  }
}
