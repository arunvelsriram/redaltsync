function openAuthPopup(accountType) {
    const width = 900;
    const height = 700;
    const left = (window.innerWidth - width) / 2;
    const top = (window.innerHeight - height) / 2;

    const popup = window.open(
        `/auth?account=${accountType}`,
        'Reddit Auth',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    );

    // Listen for messages from the popup
    window.addEventListener('message', function(event) {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'AUTH_SUCCESS') {
            const { account, token } = event.data;
            // Fetch user data first, then store token if successful
            fetchUserDataAndUpdateStatus(account, token);
            // Close the popup
            popup.close();
        }
    }, false);
}

function updateAccountStatus(type, data) {
    const statusElement = document.getElementById(`${type}-account-status`);
    const buttonElement = statusElement.parentElement.nextElementSibling;
    
    if (data.error) {
        statusElement.innerHTML = 'Not Connected - <small class="text-danger">' + data.error + '</small>';
        statusElement.className = 'text-danger';
        buttonElement.innerHTML = '<i class="fab fa-reddit me-2"></i>Connect';
    } else {
        statusElement.innerHTML = `Connected as <a href="https://reddit.com/user/${data.username}" target="_blank" class="text-success">${data.username}</a>`;
        statusElement.className = 'text-success';
        buttonElement.innerHTML = '<i class="fab fa-reddit me-2"></i>Connect Another';
    }
}

function fetchUserDataAndUpdateStatus(account, token) {
    fetch('https://oauth.reddit.com/api/v1/me', {
        headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'RedAltSync/1.0'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        updateAccountStatus(account, { username: data.name });
    })
    .catch(error => {
        // If there's an error, show the error message
        updateAccountStatus(account, { 
            error: `Connection failed: ${error.message || 'Unknown error'}` 
        });
    });
}
