document.addEventListener('DOMContentLoaded', () => {
  const enabledDomainsList = document.getElementById('enabledDomainsList');
  const nameReplacementsBody = document.getElementById('nameReplacementsBody');
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  function saveCache(cache, callback) {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ githubDisplayNameCache: cache }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving cache:', chrome.runtime.lastError.message);
          if (callback) callback(chrome.runtime.lastError);
          return;
        }
        if (callback) callback(null);
      });
    } else {
      console.warn('chrome.storage API not available. Cache not saved.');
      if (callback) callback(new Error('Storage API not available'));
    }
  }

  function loadEnabledDomains() {
    // ... (existing code, no changes needed here) ...
    if (!enabledDomainsList) {
      console.error('Error: enabledDomainsList element not found.');
      return;
    }
    enabledDomainsList.innerHTML = '';
    if (chrome && chrome.permissions && chrome.permissions.getAll) {
      chrome.permissions.getAll(permissions => {
        if (chrome.runtime.lastError) {
          console.error('Error getting permissions:', chrome.runtime.lastError.message);
          const errorItem = document.createElement('li');
          errorItem.textContent = 'Error loading domains. Check browser console.';
          errorItem.style.color = 'red';
          enabledDomainsList.appendChild(errorItem);
          return;
        }
        const origins = permissions.origins || [];
        if (origins.length === 0) {
          const listItem = document.createElement('li');
          listItem.textContent = 'No specific GitHub domains enabled. Extension will ask for permission on first use on a new domain.';
          enabledDomainsList.appendChild(listItem);
        } else {
          origins.forEach(origin => {
            if (origin.startsWith('http://') || origin.startsWith('https://')) {
              const listItem = document.createElement('li');
              listItem.textContent = origin;
              enabledDomainsList.appendChild(listItem);
            }
          });
          if (enabledDomainsList.children.length === 0) {
             const listItem = document.createElement('li');
             listItem.textContent = 'No specific GitHub domains enabled. Extension will ask for permission on first use on a new domain.';
             enabledDomainsList.appendChild(listItem);
          }
        }
      });
    } else {
      console.warn('chrome.permissions API not available. Displaying placeholder for domains.');
      const listItem = document.createElement('li');
      listItem.textContent = 'Permissions API not available (are you running this outside an extension?).';
      enabledDomainsList.appendChild(listItem);
    }
  }

  function updateExpirationDateCell(cell, noExpire, timestamp) {
    if (noExpire) {
      cell.textContent = 'Never';
    } else if (timestamp) {
      const expirationTimestamp = timestamp + SEVEN_DAYS;
      cell.textContent = new Date(expirationTimestamp).toLocaleString();
    } else {
      cell.textContent = 'N/A';
    }
  }

  function loadNameReplacements() {
    if (!nameReplacementsBody) {
      console.error('Error: nameReplacementsBody element not found.');
      return;
    }
    nameReplacementsBody.innerHTML = '';

    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['githubDisplayNameCache'], result => {
        if (chrome.runtime.lastError) {
          console.error('Error loading name replacements:', chrome.runtime.lastError.message);
          const row = nameReplacementsBody.insertRow();
          const cell = row.insertCell();
          cell.colSpan = 5; // Adjusted: Origin, Username, Display Name, Do Not Expire, Expiration Date
          cell.textContent = 'Error loading replacements. Check browser console.';
          cell.style.color = 'red';
          return;
        }

        const cache = result.githubDisplayNameCache || {};
        if (Object.keys(cache).length === 0) {
          const row = nameReplacementsBody.insertRow();
          const cell = row.insertCell();
          cell.colSpan = 5; // Adjusted
          cell.textContent = 'No name replacements configured yet.';
          nameReplacementsBody.appendChild(row);
          return;
        }

        const sortedEntries = [];
        for (const origin in cache) {
          for (const username in cache[origin]) {
            sortedEntries.push({
              origin: origin,
              username: username,
              data: cache[origin][username]
            });
          }
        }

        sortedEntries.sort((a, b) => {
          const userA = a.username.toLowerCase();
          const userB = b.username.toLowerCase();
          if (userA < userB) return -1;
          if (userA > userB) return 1;
          return 0;
        });

        sortedEntries.forEach(entry => {
            const { origin, username, data } = entry;
            const row = nameReplacementsBody.insertRow();
            row.id = username; // Add id attribute to the row
            row.dataset.origin = origin;
            row.dataset.username = username;
            row.dataset.originalDisplay = data.displayName || ''; // Store initial display name for revert

            row.insertCell().textContent = origin;

            // Username cell (make it a link)
            const usernameCell = row.insertCell();
            const userLink = document.createElement('a');
            userLink.href = `https://${origin}/${username}`; // Construct URL
            userLink.textContent = username;
            userLink.target = '_blank'; // Open in new tab
            usernameCell.appendChild(userLink);

            const displayNameCell = row.insertCell();
            const displayNameInput = document.createElement('input');
            displayNameInput.type = 'text';
            displayNameInput.value = data.displayName || '';
            displayNameCell.appendChild(displayNameInput);

            const noExpireCell = row.insertCell();
            const noExpireCheckbox = document.createElement('input');
            noExpireCheckbox.type = 'checkbox';
            noExpireCheckbox.checked = data.noExpire || false;
            noExpireCell.appendChild(noExpireCheckbox);

            const expirationDateCell = row.insertCell();
            updateExpirationDateCell(expirationDateCell, data.noExpire, data.timestamp);

            // Removed ActionsCell and Delete Button

            let typingTimer;
            const doneTypingInterval = 1000;
            let previousDisplayName = data.displayName || ''; // Tracks last successfully saved non-empty name

            displayNameInput.addEventListener('focus', () => {
                // Store the value when field is focused, for potential revert if deletion is cancelled
                row.dataset.originalDisplay = displayNameInput.value;
            });

            displayNameInput.addEventListener('input', () => {
                clearTimeout(typingTimer);
                typingTimer = setTimeout(() => {
                    const currentOrigin = row.dataset.origin;
                    const currentUsername = row.dataset.username;
                    const currentInputValue = displayNameInput.value; // Value before trimming for revert logic

                    if (currentInputValue.trim() === '') {
                        // Attempting to clear the display name, confirm deletion
                        const originalNameToRevert = row.dataset.originalDisplay || previousDisplayName;
                        if (confirm(`Are you sure you want to delete the entry for '${currentUsername}' on '${currentOrigin}' by clearing its display name?`)) {
                            chrome.storage.local.get(['githubDisplayNameCache'], res => {
                                if (res.lastError) {
                                    console.error('Error fetching cache for delete:', res.lastError.message);
                                    alert('Error deleting. Check console.');
                                    displayNameInput.value = originalNameToRevert; // Revert on error too
                                    return;
                                }
                                const currentCache = res.githubDisplayNameCache || {};
                                if (currentCache[currentOrigin] && currentCache[currentOrigin][currentUsername]) {
                                    delete currentCache[currentOrigin][currentUsername];
                                    if (Object.keys(currentCache[currentOrigin]).length === 0) {
                                        delete currentCache[currentOrigin];
                                    }
                                    saveCache(currentCache, (err) => {
                                        if (err) {
                                            alert('Failed to delete entry. Check console.');
                                            displayNameInput.value = originalNameToRevert; // Revert on error
                                        } else {
                                            loadNameReplacements(); // Reload table
                                        }
                                    });
                                } else {
                                     alert('Could not find the entry to delete. Please refresh.');
                                     displayNameInput.value = originalNameToRevert;
                                }
                            });
                        } else {
                            // User cancelled deletion
                            displayNameInput.value = originalNameToRevert;
                        }
                        return; // Stop further processing for this input event
                    }

                    // Non-empty display name, proceed with auto-save
                    const newDisplayName = currentInputValue.trim();
                    if (newDisplayName !== currentInputValue) { // If trimming changed the value
                        displayNameInput.value = newDisplayName; // Update UI to show trimmed value
                    }

                    if (newDisplayName === previousDisplayName) return; // No actual change from last saved state

                    chrome.storage.local.get(['githubDisplayNameCache'], res => {
                        if (res.lastError) {
                            console.error('Error fetching cache for auto-save:', res.lastError.message);
                            alert('Error auto-saving. Check console.');
                            return;
                        }
                        const currentCache = res.githubDisplayNameCache || {};
                        if (currentCache[currentOrigin] && currentCache[currentOrigin][currentUsername]) {
                            const updatedEntry = currentCache[currentOrigin][currentUsername];
                            updatedEntry.displayName = newDisplayName;
                            updatedEntry.noExpire = true;
                            updatedEntry.timestamp = Date.now();

                            previousDisplayName = newDisplayName;
                            row.dataset.originalDisplay = newDisplayName; // Update for next focus/revert

                            saveCache(currentCache, (err) => {
                                if (err) {
                                    alert('Failed to auto-save changes. Check console.');
                                } else {
                                    noExpireCheckbox.checked = true;
                                    updateExpirationDateCell(expirationDateCell, updatedEntry.noExpire, updatedEntry.timestamp);
                                    displayNameInput.style.backgroundColor = '#e6ffe6';
                                    setTimeout(() => { displayNameInput.style.backgroundColor = ''; }, 1000);
                                }
                            });
                        } else {
                             alert('Could not find the entry to update for auto-save. Please refresh.');
                        }
                    });
                }, doneTypingInterval);
            });

            noExpireCheckbox.addEventListener('change', () => {
                const currentOrigin = row.dataset.origin;
                const currentUsername = row.dataset.username;
                const isChecked = noExpireCheckbox.checked;

                chrome.storage.local.get(['githubDisplayNameCache'], res => {
                    if (res.lastError) {
                        console.error('Error fetching cache for noExpire change:', res.lastError.message);
                        alert('Error saving noExpire change. Check console.');
                        return;
                    }
                    const currentCache = res.githubDisplayNameCache || {};
                    if (currentCache[currentOrigin] && currentCache[currentOrigin][currentUsername]) {
                        const updatedEntry = currentCache[currentOrigin][currentUsername];
                        updatedEntry.noExpire = isChecked;
                        updatedEntry.timestamp = Date.now();

                        saveCache(currentCache, (err) => {
                            if (err) {
                                alert('Failed to save noExpire change. Check console.');
                            } else {
                                updateExpirationDateCell(expirationDateCell, updatedEntry.noExpire, updatedEntry.timestamp);
                            }
                        });
                    } else {
                        alert('Could not find the entry to update for noExpire change. Please refresh.');
                    }
                });
            });
        });
      });
    } else {
      console.warn('chrome.storage API not available. Displaying placeholder for replacements.');
      const row = nameReplacementsBody.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 5; // Adjusted
      cell.textContent = 'Storage API not available (are you running this outside an extension?).';
      nameReplacementsBody.appendChild(row);
    }
  }

  loadEnabledDomains();
  loadNameReplacements();
});
