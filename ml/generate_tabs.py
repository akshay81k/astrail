import re
import os

with open('mission_control.html', 'r', encoding='utf-8') as f:
    html = f.read()

pages = {
    'telemetry.html': ('📈 Telemetry', "<div style='padding:40px;text-align:center'><h2 style='color:var(--text-muted)'>Live Telemetry Stream</h2><p>Full 23-sensor multiplexed view coming soon.</p></div>"),
    'subsystems.html': ('⚙️ Subsystems', "<div style='padding:40px;text-align:center'><h2 style='color:var(--text-muted)'>Subsystem Deep Dive</h2><p>Detailed DAG view coming soon.</p></div>"),
    'incidents.html': ('⚠️ Incidents', "<div style='padding:40px;text-align:center'><h2 style='color:var(--text-muted)'>Incident Log</h2><p>Historical incident reports coming soon.</p></div>"),
    'analysis.html': ('🔬 Analysis', "<div style='padding:40px;text-align:center'><h2 style='color:var(--text-muted)'>ML Analysis Engine</h2><p>Model metrics and explanation layers coming soon.</p></div>"),
    'simulator.html': ('🎮 Simulator', "<div style='padding:40px;text-align:center'><h2 style='color:var(--text-muted)'>Fault Simulator</h2><p>Manual fault injection panel coming soon.</p></div>"),
    'reports.html': ('📄 Reports', "<div style='padding:40px;text-align:center'><h2 style='color:var(--text-muted)'>Mission Reports</h2><p>Automated PDF generation coming soon.</p></div>")
}

dashboard_regex = re.compile(r'<!-- Dashboard -->.*?</div>\s*</main>', re.DOTALL)

for filename, (title, content) in pages.items():
    # Remove active class from mission control
    new_html = html.replace('class="nav-link active">📊 Mission Control', 'class="nav-link">📊 Mission Control')
    
    # Add active class to current file
    new_html = new_html.replace(f'href="{filename}" class="nav-link"', f'href="{filename}" class="nav-link active"')
    
    # Replace dashboard content
    new_dash = f'<!-- Dashboard -->\n<div class="dashboard" style="display:flex; justify-content:center; align-items:center; height:100%;">\n{content}\n</div>\n</main>'
    new_html = dashboard_regex.sub(new_dash, new_html)
    
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(new_html)
print('Generated 6 pages!')
