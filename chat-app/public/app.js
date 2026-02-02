document.getElementById('joinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();

    if (username) {
        localStorage.setItem('chatUsername', username);
        window.location.href = 'chat.html';
    }
});
