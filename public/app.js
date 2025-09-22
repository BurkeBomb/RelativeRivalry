diff --git a/public/app.js b/public/app.js
index c70a053abe63b39922c7227882df30b8daec95b2..2e9703cdd5b3456f803b2b3916e1236d78139967 100644
--- a/public/app.js
+++ b/public/app.js
@@ -359,62 +359,73 @@ function showFormMessage(message, type) {
   } else if (type === 'error') {
     elements.formMessage.classList.add('error');
   }
 }
 
 function disableSubmissionForm() {
   elements.submissionForm.querySelector('button[type="submit"]').disabled = true;
   elements.playerName.disabled = true;
   elements.sabotageTarget.disabled = true;
 }
 
 function renderLeaderboard(entries) {
   state.leaderboardCache = entries || [];
   elements.leaderboard.innerHTML = '';
 
   if (!state.leaderboardCache.length) {
     const empty = document.createElement('li');
     empty.textContent = 'No scores yet. Be the first to claim the crown!';
     elements.leaderboard.appendChild(empty);
   } else {
     state.leaderboardCache.forEach((entry, index) => {
       const li = document.createElement('li');
       if (index === 0) {
         li.classList.add('top-entry');
       }
+
       const primary = document.createElement('div');
       primary.className = 'row-primary';
-      primary.innerHTML = `<span>${entry.playerName}</span><span>${entry.adjustedScore}</span>`;
+      const playerName = document.createElement('span');
+      playerName.textContent = entry.playerName;
+      const adjustedScore = document.createElement('span');
+      adjustedScore.textContent = entry.adjustedScore;
+      primary.appendChild(playerName);
+      primary.appendChild(adjustedScore);
 
       const secondary = document.createElement('div');
       secondary.className = 'row-secondary';
-      secondary.innerHTML = `Score: ${entry.score} · Correct: ${entry.correctCount} · Time: ${formatTime(entry.timeTakenSeconds)}`;
+      secondary.textContent = `Score: ${entry.score} · Correct: ${entry.correctCount} · Time: ${formatTime(entry.timeTakenSeconds)}`;
 
       const penaltyRow = document.createElement('div');
       penaltyRow.className = 'row-secondary';
-      const penaltyValue = entry.sabotagePenalty > 0 ? `-${entry.sabotagePenalty}` : '0';
-      penaltyRow.innerHTML = `<span>Sabotage Penalty</span><span class="penalty">${penaltyValue}</span>`;
+      const penaltyLabel = document.createElement('span');
+      penaltyLabel.textContent = 'Sabotage Penalty';
+      const penaltyValue = document.createElement('span');
+      penaltyValue.className = 'penalty';
+      penaltyValue.textContent = entry.sabotagePenalty > 0 ? `-${entry.sabotagePenalty}` : '0';
+      penaltyRow.appendChild(penaltyLabel);
+      penaltyRow.appendChild(penaltyValue);
 
       li.appendChild(primary);
       li.appendChild(secondary);    
       li.appendChild(penaltyRow);
       elements.leaderboard.appendChild(li);
     });
   }
 
   updateSabotageOptions();
 }
 
 function updateSabotageOptions() {
   if (!elements.sabotageTarget) {
     return;
   }
   const current = elements.sabotageTarget.value;
   while (elements.sabotageTarget.options.length > 1) {
     elements.sabotageTarget.remove(1);
   }
   state.leaderboardCache.forEach((entry) => {
     const option = document.createElement('option');
     option.value = entry.playerName;
     option.textContent = entry.playerName;
     elements.sabotageTarget.appendChild(option);
   });
