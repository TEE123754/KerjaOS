"""Tiny paired synthetic resume smoke for retained deterministic matching.
No real demographic data, external models or representative fairness claim.
"""
import json
from pathlib import Path
import pytest
from app.services.agents.matching_agent import build_position_fit_assessment
from app.services.agents import bias_agent

@pytest.mark.parametrize('left,right',[
 ({'name':'Alex','gender':'male'},{'name':'Aina','gender':'female'}),
 ({'name':'Applicant','age':24},{'name':'Applicant','age':54}),
 ({'name':'Candidate EN'},{'name':'Pemohon BM'}),
])
def test_equal_qualification_pairs_keep_deterministic_scores(left,right,monkeypatch):
 monkeypatch.setattr(bias_agent,'get_openai_client',lambda:None)
 job={'title':'Backend Engineer','requirements':['Python','FastAPI','Postgres'],'department':'Engineering'}
 qualifications={'skills':['Python','FastAPI','Postgres'],'experiences':[{'title':'Backend Engineer','description':'Built Python FastAPI Postgres APIs','duration':'2021-2026'}],'education':[{'degree':'Computer Science','school':'Synthetic College'}]}
 controls={'scoring_mode':'blind_merit','prestige_weight':0,'anonymized_blind_hiring':True,'neutralize_prestige':True}
 a=build_position_fit_assessment(job,{**qualifications,**left},controls)
 b=build_position_fit_assessment(job,{**qualifications,**right},controls)
 assert a['scores']==b['scores']
 assert a['fit_breakdown']==b['fit_breakdown']
 report=Path(__file__).resolve().parents[2]/'docs/m9/RESUME_FAIRNESS.json'
 data=json.loads(report.read_text()) if report.exists() else {'scope':'Three tiny synthetic paired resumes for retained deterministic matching only; no real data/model/ranking deployment, representative fairness or probability calibration claim','pairs':[]}
 data['pairs']=[p for p in data['pairs'] if p['left']!=left]+[{'left':left,'right':right,'scores':a['scores'],'result':'equal_qualification_scores'}]
 report.write_text(json.dumps(data,indent=2))
