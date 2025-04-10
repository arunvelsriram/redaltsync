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
        
        // After successful user fetch, fetch subreddits
        fetchSubreddits(account, token);
    })
    .catch(error => {
        // If there's an error, show the error message
        updateAccountStatus(account, { 
            error: `Connection failed: ${error.message || 'Unknown error'}` 
        });
    });
}

function fetchSubreddits(account, token) {
    // Show the subreddits container
    const subredditsContainer = document.getElementById(`${account}-subreddits`);
    subredditsContainer.classList.remove('d-none');
    
    // Update loading state for horizontal layout
    const subredditList = document.getElementById(`${account}-subreddit-list`);
    subredditList.innerHTML = `
        <div class="text-center w-100 py-3">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 mb-0">Loading subreddits...</p>
        </div>
    `;
    
    // Initialize variables for pagination
    let allSubreddits = [];
    let after = null;
    let hasMore = true;
    
    // Function to fetch a page of subreddits
    function fetchPage() {
        let url = 'https://oauth.reddit.com/subreddits/mine/subscriber?limit=100';
        if (after) {
            url += `&after=${after}`;
        }
        
        return fetch(url, {
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
            // Add subreddits to our collection
            allSubreddits = allSubreddits.concat(data.data.children);
            
            // Check if there are more pages
            after = data.data.after;
            hasMore = !!after;
            
            // If there are more pages, fetch the next page
            if (hasMore) {
                return fetchPage();
            } else {
                // Display all subreddits when done
                displaySubreddits(account, allSubreddits);
            }
        });
    }
    
    // Start fetching
    fetchPage().catch(error => {
        // If there's an error, show the error message
        subredditList.innerHTML = `
            <div class="alert alert-danger">
                Failed to load subreddits: ${error.message || 'Unknown error'}
            </div>
        `;
    });
}

function displaySubreddits(account, subreddits) {
    const subredditList = document.getElementById(`${account}-subreddit-list`);
    const totalCountElement = document.getElementById(`${account}-total-count`);
    
    // Update total count
    totalCountElement.textContent = `${subreddits.length} total`;
    
    if (subreddits.length === 0) {
        subredditList.innerHTML = '<div class="text-center text-muted">No subreddits found</div>';
        return;
    }
    
    // Sort subreddits alphabetically
    subreddits.sort((a, b) => a.data.display_name.localeCompare(b.data.display_name));
    
    // Create HTML for each subreddit
    const subredditHTML = subreddits.map(subreddit => {
        const name = subreddit.data.display_name;
        
        // For source account, make subreddits selectable
        if (account === 'source') {
            return `
                <div class="subreddit-item" data-subreddit="${name}">
                    <input type="checkbox" class="subreddit-checkbox" id="source-check-${name}" tabindex="-1">
                    <div class="subreddit-name">
                        <a href="https://reddit.com/r/${name}" target="_blank" class="subreddit-link">r/${name}</a>
                    </div>
                </div>
            `;
        } else {
            // For target account, make subreddits read-only
            return `
                <div class="subreddit-item readonly" data-subreddit="${name}">
                    <div class="subreddit-name">
                        <a href="https://reddit.com/r/${name}" target="_blank" class="subreddit-link">r/${name}</a>
                    </div>
                </div>
            `;
        }
    }).join('');
    
    subredditList.innerHTML = subredditHTML;
    
    // Add event listeners for selectable subreddits
    if (account === 'source') {
        const selectedCountElement = document.getElementById('source-selected-count');
        let selectedCount = 0;
        
        // Add click event to each subreddit item
        const subredditItems = subredditList.querySelectorAll('.subreddit-item');
        subredditItems.forEach(item => {
            // Prevent checkbox from being clicked directly
            const checkbox = item.querySelector('.subreddit-checkbox');
            checkbox.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            });
            
            // Handle clicks on the subreddit item
            item.addEventListener('click', function(e) {
                // Don't toggle if clicking on the link
                if (e.target.classList.contains('subreddit-link')) return;
                
                // Toggle the checkbox
                checkbox.checked = !checkbox.checked;
                
                // Update the selected class
                if (checkbox.checked) {
                    this.classList.add('selected');
                    selectedCount++;
                } else {
                    this.classList.remove('selected');
                    selectedCount--;
                }
                
                // Update selected count
                selectedCountElement.textContent = `${selectedCount} selected`;
            });
        });
    }
}

// Add a function to get selected subreddits
function getSelectedSubreddits() {
    const selectedSubreddits = [];
    const checkboxes = document.querySelectorAll('#source-subreddit-list .subreddit-checkbox:checked');
    
    checkboxes.forEach(checkbox => {
        const subredditItem = checkbox.closest('.subreddit-item');
        const subredditName = subredditItem.getAttribute('data-subreddit');
        selectedSubreddits.push(subredditName);
    });
    
    return selectedSubreddits;
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
    
    // Add event listeners for Select All and Deselect All buttons
    const toggleAllBtn = document.getElementById('source-toggle-all');
    
    if (toggleAllBtn) {
        toggleAllBtn.addEventListener('click', function() {
            const checkboxes = document.querySelectorAll('#source-subreddit-list .subreddit-checkbox');
            const selectedCountElement = document.getElementById('source-selected-count');
            const allSelected = Array.from(checkboxes).every(checkbox => checkbox.checked);
            
            checkboxes.forEach(checkbox => {
                checkbox.checked = !allSelected;
                const subredditItem = checkbox.closest('.subreddit-item');
                
                if (!allSelected) {
                    subredditItem.classList.add('selected');
                } else {
                    subredditItem.classList.remove('selected');
                }
            });
            
            // Update button text
            this.textContent = allSelected ? 'Select All' : 'Deselect All';
            
            // Update selected count
            selectedCountElement.textContent = allSelected ? '0 selected' : `${checkboxes.length} selected`;
        });
    }
}); 