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
            fetchUser(account, token, true);
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

function fetchUser(account, token, shouldStoreToken = false) {
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
        // If we should store the token (after successful OAuth), store it now
        if (shouldStoreToken) {
            localStorage.setItem(`reddit_${account}_token`, token);
        }
        updateAccountStatus(account, { username: data.name });
    })
    .catch(error => {
        // If there's an error, show the error message
        updateAccountStatus(account, { 
            error: `Connection failed: ${error.message || 'Unknown error'}` 
        });
    });
}

// Check for existing tokens on page load
document.addEventListener('DOMContentLoaded', function() {
    // Check for existing tokens
    ['source', 'target'].forEach(account => {
        const token = localStorage.getItem(`reddit_${account}_token`);
        if (token) {
            // Check if token is expired by decoding JWT
            try {
                const base64Url = token.split('.')[1];
                const jsonPayload = JSON.parse(atob(base64Url));
                
                const expirationTime = jsonPayload.exp * 1000; // Convert to milliseconds
                
                if (Date.now() >= expirationTime) {
                    // Token is expired, remove it
                    localStorage.removeItem(`reddit_${account}_token`);
                    updateAccountStatus(account, { 
                        error: 'Token expired' 
                    });
                } else {
                    // Token is still valid, fetch user data
                    fetchUser(account, token);
                }
            } catch (error) {
                // If token is invalid or can't be decoded, remove it
                localStorage.removeItem(`reddit_${account}_token`);
                updateAccountStatus(account, { 
                    error: 'Invalid token format' 
                });
            }
        }
    });
}); 