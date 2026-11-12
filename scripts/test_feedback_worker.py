import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('feedback_worker',Path(__file__).with_name('feedback-worker.py'))
worker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

COMMIT_MESSAGE='fix(web): correct feedback display\n\n- Keep feedback changes consistent with the requested behavior'

def quota(used,window=300):
    return {'checked_at':worker.time.time(),'groups':[{'displayName':'Gemini Models','buckets':[
        {'bucketId':'gemini-5h' if window==300 else 'gemini-weekly','remainingFraction':None if used is None else 1-used/100,'resetTime':'2026-10-27T00:00:00Z'},
    ]}]}

class QuotaTests(unittest.TestCase):
    def test_threshold_uses_remaining_and_allows_exactly_twenty(self):
        self.assertTrue(worker.quota_decision(quota(80))['allowed'])
        self.assertFalse(worker.quota_decision(quota(81))['allowed'])
        self.assertEqual(worker.quota_decision(quota(100))['remaining_percent'],0)
        self.assertTrue(worker.quota_decision(quota(0))['allowed'])
    def test_wrong_window_and_unavailable_values_fail_closed(self):
        for value in [quota(20,10080),quota(None),quota(float('nan')),quota(-1),quota(101),{}]:
            with self.assertRaises(ValueError):worker.quota_decision(value)
    def test_stale_reading_is_rejected(self):
        value=quota(30);value['checked_at']-=100
        with self.assertRaises(ValueError):worker.quota_decision(value)
    def test_weekly_exhaustion_overrides_large_remaining(self):
        value=quota(10);value['groups'][0]['buckets'].append({'bucketId':'gemini-weekly','remainingFraction':0})
        self.assertFalse(worker.quota_decision(value)['allowed'])
    def test_quota_failure_always_delivers_without_starting_development(self):
        from unittest.mock import patch
        service=worker.Worker.__new__(worker.Worker);service.id='fixture'
        service.deliver=lambda run,payload: results.append(payload)
        results=[]
        with patch.object(worker.json,'loads',return_value={'minimumRemainingPercent':20}),patch.object(worker,'read_quota',side_effect=ValueError('读取开发额度超时')),patch.object(worker,'project_fingerprints') as snapshot:
            service.execute({'id':'fixture','revision':1})
            snapshot.assert_not_called()
        self.assertEqual(results[0]['status'],'blocked')
        self.assertIn('读取开发额度超时',results[0]['reply'])
    def test_development_runs_in_container_with_a_persistent_session(self):
        from unittest.mock import patch
        work=worker.ROOT/'data/feedback/worktrees/fixture'
        with patch.object(Path,'read_text',return_value='{}'),patch.object(Path,'mkdir'):
            args=worker.development_args(work,worker.DATA/'runs/fixture/schema.json','task')
        self.assertEqual(args[:4],['docker','compose','exec','-T'])
        self.assertIn(str(work),args)
        self.assertIn('pi-worker',args)
        self.assertNotIn('--session',args)
        self.assertNotIn('--session-dir',args)
        self.assertNotIn('--session-id',args)
        self.assertIn('--name',args)
        self.assertIn('/tmp/feedback-fixture.pid',args)
        self.assertNotIn('--no-session',args)
        self.assertIn('/opt/feedback/run-pi.py',args)
        self.assertIn(worker.PI,args);self.assertIn('gemini-3.8-flash',args)
        self.assertNotIn('/opt/homebrew/bin/codex',args)
    def test_low_quota_replies_without_calling_development(self):
        from unittest.mock import patch
        service=worker.Worker.__new__(worker.Worker);service.id='fixture';service.heartbeat=lambda quota:None
        results=[];service.deliver=lambda run,payload:results.append(payload)
        with patch.object(worker.json,'loads',return_value={'minimumRemainingPercent':20}),patch.object(worker,'read_quota',return_value=worker.quota_decision(quota(81))),patch.object(worker,'project_fingerprints') as snapshot:
            service.execute({'id':'fixture','revision':1})
            snapshot.assert_not_called()
        self.assertAlmostEqual(results[0]['result']['quota']['remaining_percent'],19)
        self.assertIsNone(results[0]['development_reply'])

    def test_unexpected_failure_keeps_original_traceback_locally(self):
        import tempfile
        from unittest.mock import patch
        service=worker.Worker.__new__(worker.Worker);service.id='fixture'
        results=[];service.deliver=lambda run,payload:results.append(payload)
        with tempfile.TemporaryDirectory() as directory,patch.object(worker,'DATA',Path(directory)):
            with patch.object(service,'live_quota',side_effect=OSError('specific diagnostic detail')):
                service.execute({'id':'failure','revision':1})
            self.assertIn('OSError: specific diagnostic detail',(Path(directory)/'runs/failure/exception.log').read_text())
        self.assertEqual(results[0]['error_type'],'environment')
        self.assertNotIn('specific diagnostic detail',results[0]['reply'])

    def test_container_runner_can_cancel_the_process_group(self):
        import tempfile
        import sys
        import subprocess
        import time
        runner=worker.ROOT/'services/pi-worker/run-pi.py'
        with tempfile.TemporaryDirectory() as directory:
            pid=Path(directory)/'pi.pid'
            proc=subprocess.Popen([sys.executable,str(runner),'--pid-file',str(pid),'--',sys.executable,'-c','import time; time.sleep(60)'])
            try:
                for _ in range(100):
                    if pid.exists():break
                    time.sleep(.02)
                self.assertTrue(pid.exists())
                subprocess.run([sys.executable,str(runner),'--pid-file',str(pid),'--stop'],check=True,timeout=10)
                self.assertNotEqual(proc.wait(timeout=5),0)
                self.assertFalse(pid.exists())
            finally:
                if proc.poll() is None:proc.kill();proc.wait()

if __name__=='__main__':unittest.main()

class MergeTests(unittest.TestCase):
    def fixture(self):
        import tempfile
        from unittest.mock import patch
        temp=tempfile.TemporaryDirectory(dir=worker.DATA)
        root=Path(temp.name)/'repo';root.mkdir()
        worker.subprocess.run(['git','init','-q',str(root)],check=True)
        worker.subprocess.run(['git','-C',str(root),'config','user.name','Fixture'],check=True)
        worker.subprocess.run(['git','-C',str(root),'config','user.email','fixture@localhost'],check=True)
        (root/'.gitignore').write_text('/data/\n')
        (root/'file.txt').write_text('baseline\n')
        worker.subprocess.run(['git','-C',str(root),'add','.'],check=True)
        worker.subprocess.run(['git','-C',str(root),'commit','-qm','fixture'],check=True)
        data=root/'data/feedback';data.mkdir(parents=True)
        return temp,root,data
    def test_resume_without_new_edits_reuses_commit_and_original_message(self):
        from unittest.mock import patch
        temp,root,data=self.fixture()
        try:
            with patch.object(worker,'ROOT',root),patch.object(worker,'DATA',data):
                (root/'unrelated.txt').write_text('keep existing work')
                work,base=worker.snapshot_worktree({'id':'original','topic_id':7})
                (work/'new.txt').write_text('task change')
                first=worker.merge_changes(work,base,None,'original',COMMIT_MESSAGE,7)
                message=worker.git('log','-1','--format=%B',cwd=work)
                again=worker.merge_changes(work,base,None,'retry','',7)
                self.assertEqual(again['commit'],first['commit'])
                self.assertEqual(worker.git('rev-parse','HEAD',cwd=work),first['commit'])
                self.assertEqual(worker.git('log','-1','--format=%B',cwd=work),message)
                self.assertIn('Feedback-Run: original',message)
                (work/'another.txt').write_text('new pending change')
                with self.assertRaises(ValueError):worker.merge_changes(work,base,None,'retry','',7)
                self.assertEqual(worker.git('rev-parse','HEAD',cwd=work),first['commit'])
        finally:temp.cleanup()
    def test_merge_preserves_existing_dirty_changes_and_index(self):
        from unittest.mock import patch
        temp,root,data=self.fixture()
        try:
            with patch.object(worker,'ROOT',root),patch.object(worker,'DATA',data):
                (root/'file.txt').write_text('user dirty change\n')
                before=worker.project_fingerprints()
                index=worker.git('diff','--cached')
                work,base=worker.snapshot_worktree({'id':'merge-fixture','topic_id':'1'})
                (work/'file.txt').write_text('user dirty change\nAI change\n')
                result=worker.merge_changes(work,base,before,'merge-fixture',COMMIT_MESSAGE,7)
                self.assertTrue(result['merged'])
                self.assertEqual((root/'file.txt').read_text(),'user dirty change\nAI change\n')
                self.assertEqual(worker.git('diff','--cached'),index)
        finally:temp.cleanup()
    def test_real_conflict_blocks_merge_and_keeps_worktree(self):
        from unittest.mock import patch
        temp,root,data=self.fixture()
        try:
            with patch.object(worker,'ROOT',root),patch.object(worker,'DATA',data):
                before=worker.project_fingerprints()
                work,base=worker.snapshot_worktree({'id':'conflict-fixture','topic_id':'2'})
                (work/'file.txt').write_text('AI change\n')
                (root/'file.txt').write_text('new manual change\n')
                with self.assertRaises(ValueError):worker.merge_changes(work,base,before,'conflict-fixture',COMMIT_MESSAGE,7)
                self.assertEqual((root/'file.txt').read_text(),'new manual change\n')
                self.assertEqual((work/'file.txt').read_text(),'AI change\n')
                (root/'file.txt').write_text('baseline\n')
                recovered=worker.merge_changes(work,base,before,'conflict-fixture',COMMIT_MESSAGE,7)
                self.assertTrue(recovered['merged'])
        finally:temp.cleanup()

    def test_nonoverlapping_changes_in_the_same_file_merge_successfully(self):
        from unittest.mock import patch
        temp,root,data=self.fixture()
        try:
            with patch.object(worker,'ROOT',root),patch.object(worker,'DATA',data):
                text=''.join(f'line {n}\n' for n in range(30))
                (root/'file.txt').write_text(text)
                before=worker.project_fingerprints()
                work,base=worker.snapshot_worktree({'id':'threeway-fixture','topic_id':'3'})
                (work/'file.txt').write_text(text.replace('line 2\n','AI edit\n'))
                (root/'file.txt').write_text(text.replace('line 27\n','manual edit\n'))
                result=worker.merge_changes(work,base,before,'threeway-fixture',COMMIT_MESSAGE,7)
                self.assertTrue(result['merged'])
                merged=(root/'file.txt').read_text()
                self.assertIn('AI edit',merged);self.assertIn('manual edit',merged)
        finally:temp.cleanup()

    def test_clean_main_uses_a_real_merge_commit(self):
        from unittest.mock import patch
        temp,root,data=self.fixture()
        try:
            with patch.object(worker,'ROOT',root),patch.object(worker,'DATA',data):
                old=worker.git('rev-parse','HEAD')
                before=worker.project_fingerprints()
                work,base=worker.snapshot_worktree({'id':'clean-fixture','topic_id':'4'})
                (work/'new.txt').write_text('new feature\n')
                result=worker.merge_changes(work,base,before,'clean-fixture',COMMIT_MESSAGE,7)
                self.assertEqual(result['merge_mode'],'branch')
                self.assertEqual((root/'new.txt').read_text(),'new feature\n')
                self.assertNotEqual(worker.git('rev-parse','HEAD'),old)
                self.assertEqual(worker.git('status','--porcelain'),'')
                message=worker.feedback_commit_message(COMMIT_MESSAGE,7,'clean-fixture')
                self.assertEqual(worker.git('log','-1','--format=%B'),message)
                self.assertEqual(worker.git('log','-1','--format=%B',result['commit']),message)
        finally:temp.cleanup()

class QuotaRefreshTests(unittest.TestCase):
    def worker(self):
        service=worker.Worker.__new__(worker.Worker);service.id='fixture';service.quota=None;service.quota_at=0.0
        service.heartbeat=lambda quota=None:None
        return service
    def threshold(self,value=20):
        from unittest.mock import patch
        return patch.object(worker,'minimum_remaining',return_value=value)
    def test_idle_worker_reports_a_fresh_quota_instead_of_a_stale_snapshot(self):
        from unittest.mock import patch
        service=self.worker();reads=[]
        def fake_read(**kwargs):
            reads.append(1);return worker.quota_decision(quota(86))
        with self.threshold(),patch.object(worker,'read_quota',side_effect=fake_read):
            first=service.display_quota()
            self.assertEqual(first['remaining_percent'],14)
            # A second poll inside the refresh window must not re-read, but must not go stale either.
            self.assertEqual(service.display_quota()['remaining_percent'],14)
            self.assertEqual(len(reads),1)
            # Once the refresh window elapses the reported value must follow the account again.
            service.quota_at-=worker.QUOTA_REFRESH_SECONDS+1
            with patch.object(worker,'read_quota',return_value=worker.quota_decision(quota(100))):
                self.assertEqual(service.display_quota()['remaining_percent'],0)
    def test_failed_refresh_reports_unknown_instead_of_repeating_the_old_percentage(self):
        from unittest.mock import patch
        service=self.worker()
        with self.threshold(),patch.object(worker,'read_quota',return_value=worker.quota_decision(quota(86))):
            self.assertEqual(service.display_quota()['remaining_percent'],14)
        service.quota_at-=worker.QUOTA_REFRESH_SECONDS+1
        with self.threshold(),patch.object(worker,'read_quota',side_effect=ValueError('读取开发额度超时')):
            failed=service.display_quota()
        self.assertIsNone(failed['remaining_percent'])
        self.assertIn('额度读取失败',failed['error'])
    def test_development_still_requires_a_successful_live_read(self):
        from unittest.mock import patch
        service=self.worker();service.quota=worker.quota_decision(quota(86));service.quota_at=0.0
        with self.threshold(),patch.object(worker,'read_quota',side_effect=ValueError('读取开发额度超时')):
            with self.assertRaises(ValueError):service.live_quota()
    def test_a_running_task_is_never_read_alongside(self):
        from unittest.mock import patch
        service=self.worker();service.quota=worker.quota_decision(quota(86));service.quota_at=0.0;service.proc=object()
        with self.threshold(),patch.object(worker,'read_quota') as read:
            self.assertEqual(service.display_quota()['remaining_percent'],14)
        read.assert_not_called()

class TemporaryQuotaTests(unittest.TestCase):
    def test_test_mode_can_disable_twenty_percent_threshold(self):
        self.assertTrue(worker.quota_decision(quota(90),minimum_remaining=0)['allowed'])
        self.assertFalse(worker.quota_decision(quota(90))['allowed'])
        value=quota(90);value['groups'][0]['buckets'].append({'bucketId':'gemini-weekly','remainingFraction':0})
        self.assertFalse(worker.quota_decision(value,minimum_remaining=0)['allowed'])

class ValidationTests(unittest.TestCase):
    def test_validation_uses_cached_flutter_tool_without_changing_sdk(self):
        import tempfile
        with tempfile.TemporaryDirectory(dir=worker.DATA) as directory:
            work=Path(directory);(work/'apps/mobile/test').mkdir(parents=True)
            (work/'apps/mobile/test/fixture_test.dart').write_text('void main() {}')
            plan=worker.validation_plan(work,['apps/mobile/test/fixture_test.dart'])
            self.assertEqual(len(plan),2)
            self.assertTrue(any('flutter_tools.snapshot' in value for value in plan[0][1]))
            command=worker.validation_command(work,plan[0][1],plan[0][2])
            policy=command[2]
            self.assertIn(str(work),policy)
    def test_dependency_setup_copies_config_and_keeps_modules_read_only(self):
        import tempfile
        from unittest.mock import patch
        with tempfile.TemporaryDirectory(dir=worker.DATA) as directory:
            root=Path(directory)/'root';work=Path(directory)/'work'
            (root/'apps/mobile/.dart_tool').mkdir(parents=True)
            (root/'apps/mobile/.dart_tool/package_config.json').write_text('{}')
            (root/'services/api/node_modules').mkdir(parents=True)
            (work/'apps/mobile').mkdir(parents=True);(work/'services/api').mkdir(parents=True)
            with patch.object(worker,'ROOT',root):worker.prepare_dependencies(work)
            self.assertEqual((work/'apps/mobile/.dart_tool/package_config.json').read_text(),'{}')
            self.assertTrue((work/'services/api/node_modules').is_dir())
            self.assertFalse((work/'services/api/node_modules').is_symlink())
    def test_validation_rejects_a_test_symlink_outside_worktree(self):
        import tempfile
        with tempfile.TemporaryDirectory(dir=worker.DATA) as directory:
            work=Path(directory)/'work';work.mkdir()
            outside=Path(directory)/'outside.js';outside.write_text('')
            (work/'test.js').symlink_to(outside)
            with self.assertRaises(ValueError):worker.validation_plan(work,['test.js'])

class DeliveryTests(MergeTests):
    def service(self):
        from unittest.mock import Mock
        service=worker.Worker.__new__(worker.Worker)
        service.id='fixture';service.stopped=False;service.proc=None;service.quota=None
        service.api=Mock(return_value={'cancel':False,'revision':1})
        service.live_quota=lambda:{'allowed':True,'remaining_percent':90,'minimum_remaining_percent':20}
        service.heartbeat=lambda quota=None:None
        return service

    def test_direct_deploy_cleans_branch_and_does_not_run_verification(self):
        from unittest.mock import patch,Mock
        temp,root,data=self.fixture()
        try:
            with patch.object(worker,'ROOT',root),patch.object(worker,'DATA',data):
                run={'id':'direct','topic_id':7,'revision':1,'result':None,'topic':{'target':'web','title':'test'}}
                work,base=worker.snapshot_worktree(run);(work/'new.txt').write_text('new')
                service=self.service();service.develop=Mock(return_value=(work,base,{'status':'ready','summary':'done','checks':[],'commit_message':COMMIT_MESSAGE},None,data))
                service.verify=Mock(side_effect=AssertionError('must not verify'))
                service.deploy=Mock(side_effect=lambda run,record:{**record,'deployed':True})
                results=[];service.deliver=lambda run,payload:results.append(payload)
                service.execute(run)
                self.assertEqual(results[0]['status'],'review');self.assertTrue(results[0]['result']['deployed'])
                self.assertFalse(work.exists());self.assertEqual(worker.git('branch','--list','feedback/*'),'')
                service.verify.assert_not_called()
        finally:temp.cleanup()

    def test_failed_deploy_preserves_branch_and_records_error(self):
        from unittest.mock import patch,Mock
        temp,root,data=self.fixture()
        try:
            with patch.object(worker,'ROOT',root),patch.object(worker,'DATA',data):
                run={'id':'failed','topic_id':7,'revision':1,'topic':{'target':'web','title':'test'}}
                work,base=worker.snapshot_worktree(run);(work/'new.txt').write_text('new')
                service=self.service();service.develop=Mock(return_value=(work,base,{'status':'ready','summary':'done','checks':[],'commit_message':COMMIT_MESSAGE},None,data))
                service.deploy=Mock(side_effect=ValueError('部署失败'))
                results=[];service.deliver=lambda run,payload:results.append(payload)
                service.execute(run)
                self.assertEqual(results[0]['status'],'blocked');self.assertIn('部署失败',results[0]['error_reason'])
                self.assertTrue(work.exists());self.assertIn('feedback/failed',worker.git('branch','--list','feedback/*'))
                self.assertTrue(worker.continuation_file(7).is_file())
        finally:temp.cleanup()

    def test_no_edit_retry_can_redeploy_existing_worktree_with_empty_message(self):
        from unittest.mock import patch,Mock
        temp,root,data=self.fixture()
        try:
            with patch.object(worker,'ROOT',root),patch.object(worker,'DATA',data):
                (root/'unrelated.txt').write_text('keep existing work')
                work,base=worker.snapshot_worktree({'id':'original','topic_id':7})
                (work/'new.txt').write_text('task change')
                first=worker.merge_changes(work,base,None,'original',COMMIT_MESSAGE,7)
                service=self.service();results=[];service.deliver=lambda run,payload:results.append(payload)
                service.develop=Mock(return_value=(work,base,{'status':'ready','summary':'no new edits','checks':[],'commit_message':''},None,data))
                service.deploy=Mock(side_effect=lambda run,record:{**record,'deployed':True})
                service.execute({'id':'retry','topic_id':7,'revision':1,'previous_change':first})
                self.assertEqual(results[-1]['status'],'review')
                self.assertEqual(results[-1]['result']['commit'],first['commit'])
                self.assertEqual(results[-1]['result']['commit_message'],worker.feedback_commit_message(COMMIT_MESSAGE,7,'original'))
                service.deploy.assert_called_once()
        finally:temp.cleanup()

    def test_no_edit_new_snapshot_retains_previous_commit_and_rollback(self):
        from unittest.mock import patch,Mock
        temp,root,data=self.fixture()
        try:
            with patch.object(worker,'ROOT',root),patch.object(worker,'DATA',data):
                (root/'unrelated.txt').write_text('keep existing work')
                work,base=worker.snapshot_worktree({'id':'original','topic_id':7})
                (work/'new.txt').write_text('task change')
                first=worker.merge_changes(work,base,None,'original',COMMIT_MESSAGE,7)
                fresh,fresh_base=worker.snapshot_worktree({'id':'fresh','topic_id':7})
                service=self.service();results=[];service.deliver=lambda run,payload:results.append(payload)
                service.develop=Mock(return_value=(fresh,fresh_base,{'status':'ready','summary':'no new edits','checks':[],'commit_message':''},None,data))
                service.deploy=Mock(side_effect=lambda run,record:{**record,'deployed':True})
                service.execute({'id':'retry','topic_id':7,'revision':1,'previous_change':first})
                self.assertEqual(results[-1]['status'],'review')
                for key in ('commit','changed_files','rollback_base','rollback_target'):
                    self.assertEqual(results[-1]['result'][key],first[key])
                self.assertEqual(results[-1]['result']['worktree'],str(fresh))
                service.deploy.assert_called_once()
        finally:temp.cleanup()

    def test_rollback_preserves_unrelated_edits_and_refuses_conflicts(self):
        from unittest.mock import patch
        temp,root,data=self.fixture()
        try:
            with patch.object(worker,'ROOT',root),patch.object(worker,'DATA',data):
                text=''.join(f'line {n}\n' for n in range(30));(root/'file.txt').write_text(text)
                work,base=worker.snapshot_worktree({'id':'rollback','topic_id':7})
                (work/'file.txt').write_text(text.replace('line 2\n','AI edit\n'))
                record=worker.merge_changes(work,base,None,'rollback',COMMIT_MESSAGE,7)
                (root/'file.txt').write_text((root/'file.txt').read_text().replace('line 27\n','manual edit\n'))
                worker.restore_delivery(record)
                self.assertIn('line 2\n',(root/'file.txt').read_text());self.assertIn('manual edit',(root/'file.txt').read_text())
                worker.restore_delivery(record) # Idempotent after an interrupted deployment.
                (root/'file.txt').write_text(text.replace('line 2\n','later edit\n'))
                with self.assertRaises(ValueError):worker.restore_delivery(record)
                self.assertIn('later edit',(root/'file.txt').read_text())
        finally:temp.cleanup()

    def test_deploy_and_rollback_operations_do_not_call_model_or_quota(self):
        from unittest.mock import Mock
        service=self.service();service.live_quota=Mock(side_effect=AssertionError('no model quota needed'))
        service.develop=Mock(side_effect=AssertionError('no model needed'))
        service.delivery_operation=Mock(side_effect=lambda run,payload:payload.update(status='review'))
        results=[];service.deliver=lambda run,payload:results.append(payload)
        service.execute({'id':'operation','revision':1,'result':{'operation':'deploy'}})
        service.live_quota.assert_not_called();service.develop.assert_not_called()

    def test_deploy_plan_reuses_existing_services_and_official_mobile_script(self):
        commands=worker.deployment_commands(['services/api/src/example.js'],'web','test')
        self.assertEqual(commands,[['docker','compose','build','api'],['docker','compose','up','-d','--no-deps','api']])
        self.assertEqual(worker.deployment_commands(['apps/web/app.js'],'web','test'),[])
        mobile=worker.deployment_commands(['apps/mobile/lib/main.dart'],'mobile','test')[0]
        self.assertIn('--skip-checks',mobile);self.assertTrue(mobile[1].endswith('scripts/deploy-mobile.py'))


class DevelopmentReplyTests(unittest.TestCase):
    def test_pi_result_survives_subsequent_validation_failure(self):
        import json
        work=Path('/tmp/issue-worktree')
        result={'status':'ready','summary':'已修改聊天显示','checks':['语法检查通过'],'worktree_name':work.name,'error_type':'none','error_reason':'','commit_message':COMMIT_MESSAGE}
        raw=json.dumps({'type':'message_end','message':{'role':'assistant','content':[{'type':'text','text':json.dumps(result)}],'stopReason':'stop'}})
        payload={}
        self.assertEqual(worker.development_result(raw,work,payload),result)
        self.assertIn('已修改聊天显示',payload['development_reply'])
    def test_invalid_model_result_is_preserved_for_display(self):
        import json
        payload={}
        raw=json.dumps({'type':'message_end','message':{'role':'assistant','content':[{'type':'text','text':'需要用户确认需求'}]}})
        with self.assertRaises(ValueError):worker.development_result(raw,Path('/tmp/work'),payload)
        self.assertEqual(payload['development_reply'],'需要用户确认需求')

class CommitMessageTests(unittest.TestCase):
    def test_model_branch_name_is_safe_unique_and_preserves_worktree(self):
        from unittest.mock import patch
        fixture=MergeTests()
        temp,root,data=fixture.fixture()
        try:
            with patch.object(worker,'ROOT',root),patch.object(worker,'DATA',data):
                run_id='53284a28-305f-40f7-9369-03c564b34a25'
                work,base=worker.snapshot_worktree({'id':run_id,'topic_id':8})
                (work/'new.txt').write_text('preserved')
                for invalid in ('../unsafe','UPPER','a--b','x'*41,'',None):
                    self.assertFalse(worker.name_feedback_branch(work,8,invalid))
                self.assertEqual(worker.git('branch','--show-current',cwd=work),'feedback/'+run_id)
                self.assertTrue(worker.name_feedback_branch(work,8,'multi-photo-meal'))
                self.assertEqual(worker.git('branch','--show-current',cwd=work),'feedback/8-multi-photo-meal-53284a28')
                self.assertEqual((work/'new.txt').read_text(),'preserved')
                self.assertEqual(worker.git('rev-parse','HEAD',cwd=work),base)
                worker.cleanup_worktree(work)
                self.assertFalse(work.exists())
        finally:temp.cleanup()

    def test_branch_name_collision_keeps_original(self):
        from unittest.mock import patch
        fixture=MergeTests()
        temp,root,data=fixture.fixture()
        try:
            with patch.object(worker,'ROOT',root),patch.object(worker,'DATA',data):
                run_id='53284a28-305f-40f7-9369-03c564b34a25'
                work,_=worker.snapshot_worktree({'id':run_id,'topic_id':8})
                worker.git('branch','feedback/8-multi-photo-meal-53284a28')
                self.assertFalse(worker.name_feedback_branch(work,8,'multi-photo-meal'))
                self.assertEqual(worker.git('branch','--show-current',cwd=work),'feedback/'+run_id)
        finally:temp.cleanup()

    def test_invalid_message_cannot_create_a_task_commit(self):
        import tempfile
        from unittest.mock import patch
        fixture=MergeTests()
        temp,root,data=fixture.fixture()
        try:
            with patch.object(worker,'ROOT',root),patch.object(worker,'DATA',data):
                work,base=worker.snapshot_worktree({'id':'invalid-message','topic_id':7})
                (work/'new.txt').write_text('keep pending changes')
                with self.assertRaises(ValueError):worker.merge_changes(work,base,None,'invalid-message','Feedback task-id',7)
                self.assertEqual(worker.git('rev-parse','HEAD',cwd=work),base)
                self.assertEqual((work/'new.txt').read_text(),'keep pending changes')
                self.assertEqual(worker.git('diff','--cached',cwd=work),'')
        finally:temp.cleanup()

    def test_rejects_generic_headers_missing_details_and_spoofed_markers(self):
        invalid=['Feedback task-id','fix(web): fix display',
                 'fix(web): Fix display\n\n- Explain the change',
                 'fix(web): fix display.\n\n- Explain the change',
                 'fix(web): '+'x'*50+'\n\n- Explain the change',
                 COMMIT_MESSAGE+'\n\n- '+'x'*73,
                 COMMIT_MESSAGE+'\n\nFeedback: #999',
                 COMMIT_MESSAGE+'\n\nFeedback-Run: spoofed',None]
        for message in invalid:
            with self.subTest(message=message),self.assertRaises(ValueError):
                worker.validate_commit_message(message)
        self.assertEqual(worker.validate_commit_message(COMMIT_MESSAGE),COMMIT_MESSAGE)

    def test_host_appends_feedback_markers_without_changing_details(self):
        message=worker.feedback_commit_message(COMMIT_MESSAGE,12,'task-id')
        self.assertEqual(message,COMMIT_MESSAGE+'\n\nFeedback: #12\nFeedback-Run: task-id')
        with self.assertRaises(ValueError):worker.feedback_commit_message(COMMIT_MESSAGE,'12\nevil','task-id')

    def test_ready_result_requires_message_and_preserves_reply_on_failure(self):
        import json
        result={'status':'ready','summary':'已修复','checks':[],'worktree_name':'issue','error_type':'none','error_reason':''}
        def raw():return json.dumps({'type':'message_end','message':{'role':'assistant','content':[{'type':'text','text':json.dumps(result)}]}})
        with self.assertRaises(ValueError):worker.development_result(raw(),Path('/tmp/issue'))
        result['commit_message']='Feedback task-id';payload={}
        with self.assertRaises(ValueError):worker.development_result(raw(),Path('/tmp/issue'),payload)
        self.assertEqual(payload['development_reply'],'已修复')
        result['commit_message']=COMMIT_MESSAGE
        self.assertEqual(worker.development_result(raw(),Path('/tmp/issue'))['commit_message'],COMMIT_MESSAGE)

class CompletionPushTests(unittest.TestCase):
    fixture=MergeTests.fixture
    service=DeliveryTests.service
    def completion(self,source):
        return {'id':'accept-fixture','topic_id':7,'revision':1,'result':{'operation':'accept','source_run_id':'deployment','source_result':source}}

    def remote(self,root):
        remote=root.parent/'remote.git'
        worker.subprocess.run(['git','init','--bare','-q',str(remote)],check=True)
        worker.git('remote','add','origin',str(remote))
        branch=worker.git('branch','--show-current')
        worker.git('config',f'branch.{branch}.remote','origin')
        worker.git('config',f'branch.{branch}.merge','refs/heads/main')
        return remote

    def test_complete_pushes_host_commit_without_model_or_deploy(self):
        from unittest.mock import patch,Mock
        temp,root,data=self.fixture()
        try:
            with patch.object(worker,'ROOT',root),patch.object(worker,'DATA',data):
                remote=self.remote(root)
                service=self.service()
                service.live_quota=Mock(side_effect=AssertionError('must not query quota'))
                service.develop=Mock(side_effect=AssertionError('must not call model'))
                service.deploy=Mock(side_effect=AssertionError('must not redeploy'))
                results=[];service.deliver=lambda run,payload:results.append(payload)
                source={'deployed':True,'commit':worker.git('rev-parse','HEAD')}
                (root/'unrelated.txt').write_text('keep this untracked file')
                before=worker.git('status','--porcelain')
                service.execute(self.completion(source))
                self.assertEqual(results[0]['status'],'done')
                self.assertTrue(results[0]['result']['pushed'])
                pushed=worker.subprocess.check_output(['git','--git-dir',str(remote),'rev-parse','refs/heads/main'],text=True).strip()
                self.assertEqual(pushed,source['commit'])
                self.assertEqual(worker.git('status','--porcelain'),before)
                service.live_quota.assert_not_called();service.develop.assert_not_called();service.deploy.assert_not_called()
        finally:temp.cleanup()

    def test_missing_remote_and_rejected_push_leave_topic_blocked(self):
        from unittest.mock import patch
        temp,root,data=self.fixture()
        try:
            with patch.object(worker,'ROOT',root),patch.object(worker,'DATA',data):
                service=self.service();results=[];service.deliver=lambda run,payload:results.append(payload)
                source={'deployed':True,'commit':worker.git('rev-parse','HEAD')}
                service.execute(self.completion(source))
                self.assertEqual(results[-1]['status'],'blocked')
                self.assertEqual(results[-1]['result']['operation'],'accept')
                self.assertIn('远端跟踪配置',results[-1]['error_reason'])
                remote=self.remote(root);hook=remote/'hooks/pre-receive';hook.write_text('#!/bin/sh\nexit 1\n');hook.chmod(0o755)
                service.execute(self.completion(source))
                self.assertEqual(results[-1]['status'],'blocked')
                self.assertFalse(results[-1]['result']['pushed'])
                self.assertIn('推送失败',results[-1]['error_reason'])
        finally:temp.cleanup()

    def test_completion_does_not_claim_uncommitted_task_was_pushed(self):
        from unittest.mock import patch
        temp,root,data=self.fixture()
        try:
            with patch.object(worker,'ROOT',root),patch.object(worker,'DATA',data):
                remote=self.remote(root)
                (root/'unrelated.txt').write_text('unrelated work')
                work,base=worker.snapshot_worktree({'id':'dirty','topic_id':7})
                (work/'new.txt').write_text('task change')
                record=worker.merge_changes(work,base,None,'dirty',COMMIT_MESSAGE,7)
                service=self.service();results=[];service.deliver=lambda run,payload:results.append(payload)
                source={**record,'deployed':True}
                service.execute(self.completion(source))
                self.assertEqual(results[-1]['status'],'blocked')
                self.assertIn('尚未完整提交',results[-1]['error_reason'])
                worker.git('add','new.txt');worker.git('commit','-m',COMMIT_MESSAGE)
                service.execute(self.completion(source))
                self.assertEqual(results[-1]['status'],'done')
                self.assertEqual((root/'unrelated.txt').read_text(),'unrelated work')
        finally:temp.cleanup()
