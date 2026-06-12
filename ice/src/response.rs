use protocol::threat::IncidentState;
use crate::daemon::construct::ConstructDaemon;
use tracing::info;

pub struct ThreatResponseEngine {
    current_state: IncidentState,
}

impl ThreatResponseEngine {
    pub fn new() -> Self {
        Self {
            current_state: IncidentState::Detect,
        }
    }

    pub fn get_state(&self) -> IncidentState {
        self.current_state
    }

    pub fn transition_state(&mut self, next: IncidentState) {
        info!("Threat Incident state transitioned: {:?} -> {:?}", self.current_state, next);
        self.current_state = next;
    }

    pub fn generate_ai_playbook(&self, target_ip: &str, analysis: &str) -> String {
        format!(
            "# CYBER INCIDENT PLAYBOOK - TARGET: {}\n\n\
             ## Current State: {:?}\n\n\
             ## Analysis Summary\n\
             {}\n\n\
             ## Action Steps\n\
             1. **CONTAIN**: Isolate network nodes through ICE quarantine system blocks.\n\
             2. **ERADICATE**: Run deep ports vulnerability scan using ReconDaemon.\n\
             3. **RECOVER**: Verify baseline host timing and lift quarantine safely.\n",
            target_ip, self.current_state, analysis
        )
    }
}
