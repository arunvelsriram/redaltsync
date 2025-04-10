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
        
        // Update sync button state after connecting an account
        updateSyncButtonState();
    })
    .catch(error => {
        // If there's an error, show the error message
        updateAccountStatus(account, { 
            error: `Connection failed: ${error.message || 'Unknown error'}` 
        });
        
        // Update sync button state even if there's an error
        updateSyncButtonState();
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
                // Update sync button state after displaying subreddits
                updateSyncButtonState();
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
        // Update sync button state even if there's an error
        updateSyncButtonState();
    });
}

function displaySubreddits(account, subreddits) {
    const subredditList = document.getElementById(`${account}-subreddit-list`);
    const totalCountElement = document.getElementById(`${account}-total-count`);
    
    // Update total count
    totalCountElement.textContent = `${subreddits.length} total`;
    
    if (subreddits.length === 0) {
        subredditList.innerHTML = '<div class="text-center text-muted">No subreddits found</div>';
        // Update sync button state when there are no subreddits
        updateSyncButtonState();
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
                
                // Update sync button state
                updateSyncButtonState();
            });
        });
    }
    
    // Update sync button state after setting up event listeners
    updateSyncButtonState();
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

// Function to update sync button state based on selected subreddits
function updateSyncButtonState() {
    const syncButton = document.getElementById('sync-subreddits');
    const sourceToken = localStorage.getItem('reddit_source_token');
    const targetToken = localStorage.getItem('reddit_target_token');
    
    if (syncButton) {
        // Check if source account is connected
        const sourceConnected = sourceToken !== null;
        // Check if target account is connected
        const targetConnected = targetToken !== null;
        
        // Count selected subreddits
        const selectedCount = document.querySelectorAll('#source-subreddit-list .subreddit-checkbox:checked').length;
        
        // Enable button if both accounts are connected and at least one subreddit is selected
        syncButton.disabled = selectedCount === 0 || !sourceConnected || !targetConnected;
        
        // Add a tooltip to explain why the button is disabled
        if (syncButton.disabled) {
            if (!sourceConnected) {
                syncButton.title = "Connect a source account to enable syncing";
            } else if (!targetConnected) {
                syncButton.title = "Connect a target account to enable syncing";
            } else if (selectedCount === 0) {
                syncButton.title = "Select at least one subreddit to sync";
            } else {
                syncButton.title = "";
            }
        } else {
            syncButton.title = `Sync ${selectedCount} selected subreddit${selectedCount !== 1 ? 's' : ''} to target account`;
        }
        
        // Log the state for debugging
        console.log('Sync button state updated:', {
            sourceConnected,
            targetConnected,
            selectedCount,
            buttonEnabled: !syncButton.disabled
        });
    }
}

// Function to sync selected subreddits to target account
function syncSelectedSubreddits() {
    const sourceToken = localStorage.getItem('reddit_source_token');
    const targetToken = localStorage.getItem('reddit_target_token');
    const selectedSubreddits = getSelectedSubreddits();
    
    if (selectedSubreddits.length === 0) {
        alert('Please select at least one subreddit to sync.');
        return;
    }
    
    // Show sync status
    const syncButton = document.getElementById('sync-subreddits');
    const syncStatus = document.getElementById('sync-status');
    const syncProgress = document.getElementById('sync-progress');
    const syncMessage = document.getElementById('sync-message');
    
    syncButton.disabled = true;
    syncStatus.classList.remove('d-none');
    syncProgress.style.width = '0%';
    syncMessage.textContent = 'Preparing to sync...';
    
    // Get current target subreddits to avoid subscribing to already subscribed ones
    fetch('https://oauth.reddit.com/subreddits/mine/subscriber?limit=100', {
        headers: {
            'Authorization': `Bearer ${targetToken}`,
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
        const currentSubreddits = data.data.children.map(sub => sub.data.display_name);
        const subredditsToSubscribe = selectedSubreddits.filter(sub => !currentSubreddits.includes(sub));
        
        if (subredditsToSubscribe.length === 0) {
            syncMessage.textContent = 'All selected subreddits are already subscribed.';
            syncProgress.style.width = '100%';
            syncButton.disabled = false;
            return;
        }
        
        syncMessage.textContent = `Subscribing to ${subredditsToSubscribe.length} subreddits...`;
        
        // Subscribe to each subreddit
        let completed = 0;
        let failed = 0;
        const total = subredditsToSubscribe.length;
        
        return new Promise((resolve, reject) => {
            subredditsToSubscribe.forEach((subreddit, index) => {
                // Add a small delay between requests to avoid rate limiting
                setTimeout(() => {
                    fetch(`https://oauth.reddit.com/api/subscribe`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${targetToken}`,
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'User-Agent': 'RedAltSync/1.0'
                        },
                        body: `sr_name=${subreddit}&action=sub`
                    })
                    .then(response => {
                        if (!response.ok) {
                            console.error(`Failed to subscribe to r/${subreddit}: ${response.status}`);
                            failed++;
                            syncMessage.textContent = `Error: Failed to subscribe to r/${subreddit} (${response.status})`;
                        }
                        
                        completed++;
                        const progress = Math.round((completed / total) * 100);
                        syncProgress.style.width = `${progress}%`;
                        syncMessage.textContent = `Subscribing to subreddits... (${completed}/${total})${failed > 0 ? ` - ${failed} failed` : ''}`;
                        
                        if (completed === total) {
                            resolve({ completed, failed, total });
                        }
                    })
                    .catch(error => {
                        console.error(`Error subscribing to r/${subreddit}:`, error);
                        failed++;
                        completed++;
                        
                        if (completed === total) {
                            resolve({ completed, failed, total });
                        }
                    });
                }, index * 500); // 500ms delay between requests
            });
        });
    })
    .then(result => {
        if (result.failed > 0) {
            syncMessage.textContent = `Sync completed with errors: ${result.failed} of ${result.total} subreddits failed to sync.`;
            syncProgress.classList.remove('bg-reddit');
            syncProgress.classList.add('bg-warning');
        } else {
            syncMessage.textContent = 'Sync completed successfully!';
            syncProgress.classList.remove('bg-warning');
            syncProgress.classList.add('bg-reddit');
        }
        syncButton.disabled = false;
        
        // Refresh target subreddits list
        fetchSubreddits('target', localStorage.getItem('reddit_target_token'));
    })
    .catch(error => {
        console.error('Error during sync:', error);
        syncMessage.textContent = `Error: ${error.message || 'Unknown error occurred'}`;
        syncProgress.classList.remove('bg-reddit');
        syncProgress.classList.add('bg-danger');
        syncButton.disabled = false;
    });
}

// Check for existing tokens on page load
document.addEventListener('DOMContentLoaded', function() {
    // Set current year in footer
    document.getElementById('current-year').textContent = new Date().getFullYear();

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
            
            // Update sync button state
            updateSyncButtonState();
        });
    }
    
    // Add event listener for sync button
    const syncButton = document.getElementById('sync-subreddits');
    if (syncButton) {
        syncButton.addEventListener('click', syncSelectedSubreddits);
    }
    
    // Add event listener to update sync button state when checkboxes change
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('subreddit-checkbox')) {
            updateSyncButtonState();
        }
    });
    
    // Initial update of sync button state
    updateSyncButtonState();
}); 