(function() {
  // Check if configuration exists
  if (!window.xpertConfig || !window.xpertConfig.baseUrl) {
    console.error('xpertConfig is not configured or missing baseUrl');
    return;
  }

  // Create button
  var button = document.createElement('button');
  button.id = 'xpert-bubble-button';
  button.style.position = 'fixed';
  button.style.bottom = '20px';
  button.style.right = '20px';
  button.style.zIndex = '1000';
  button.style.width = '40px';
  button.style.height = '40px';
  button.style.backgroundColor = '#1C64F2';
  button.style.color = '#fff';
  button.style.border = 'none';
  button.style.borderRadius = '50%';
  button.style.cursor = 'pointer';
  button.style.display = 'flex'
  button.style.justifyContent = 'center'
  button.style.alignItems = 'center'


  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  svg.style.width = '20px';
  svg.style.height = '20px';

  var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M11 11V5H13V11H19V13H13V19H11V13H5V11H11Z");

  svg.appendChild(path);
  button.appendChild(svg);

  // Create dialog
  var dialog = document.createElement('div');
  dialog.id = 'xpert-bubble-window';
  dialog.style.position = 'fixed';
  dialog.style.width = '480px';
  dialog.style.height = '500px';
  dialog.style.backgroundColor = '#fff';
  dialog.style.borderRadius = '14px';
  dialog.style.boxShadow = '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)';
  dialog.style.zIndex = '1001';
  dialog.style.display = 'none';
  dialog.style.overflow = 'hidden';

  // Calculate dialog position relative to button
  function positionDialogAboveButton() {
    var buttonRect = button.getBoundingClientRect();
    dialog.style.bottom = (window.innerHeight - buttonRect.top + 10) + 'px'; // 10px above the button
    dialog.style.right = (window.innerWidth - buttonRect.right) + 'px';
  }

  // Recalculate position when window size changes
  window.addEventListener('resize', positionDialogAboveButton);

  // Initial position calculation
  positionDialogAboveButton();

  // Create iframe
  var iframe = document.createElement('iframe');
  iframe.src = window.xpertConfig.baseUrl + '/x/' + window.xpertConfig.token;
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = 'none';

  // Button click event
  button.onclick = function() {
    svg.style.transition = 'transform 0.3s ease'; // Add transition animation
    if (dialog.style.display === 'none') {
      dialog.style.display = 'block';
      button.classList.add('opened');
      svg.style.transform = 'rotate(-45deg)'; // Rotate 45 degrees
      positionDialogAboveButton();
    } else {
      dialog.style.display = 'none';
      button.classList.remove('opened');
      svg.style.transform = 'rotate(0deg)'; // Restore original angle
    }
  };

  // Assemble elements
  dialog.appendChild(iframe);
  document.body.appendChild(button);
  document.body.appendChild(dialog);
})();
