/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { useEffect, useState } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import classes from "./Onboarding.module.scss";
import { Alert } from "../../components/Alert/Alert.tsx";
import {KubbyTitle} from '../../components/KubbyTitle/KubbyTitle.tsx'
import {getVersion} from '@tauri-apps/api/app'

interface KubeContext {
  name: string;
  cluster: string;
  user: string;
  is_current: boolean;
}

interface KubeContextsResult {
  contexts: KubeContext[];
  kubeconfig_path: string;
}

interface ContextNamespaceState {
  context: string;
  namespaces: string[] | null;
  error: string | null;
  loading: boolean;
}

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kubeconfigPath, setKubeconfigPath] = useState<string>("");
  const [contexts, setContexts] = useState<KubeContext[]>([]);
  const [contextNamespaces, setContextNamespaces] = useState<ContextNamespaceState[]>([]);
  
  // Config creation state
  const [creating, setCreating] = useState(false);
  const [configPath, setConfigPath] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // App version from tauri.conf.json
  const [version, setVersion] = useState<string>("");

  // Fetch app version on mount
  useEffect(() => {
    getVersion().then(setVersion);
  }, []);
  
  // Track which context errors are expanded
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  
  const toggleErrorExpanded = (contextName: string) => {
    setExpandedErrors(prev => {
      const next = new Set(prev);
      if (next.has(contextName)) {
        next.delete(contextName);
      } else {
        next.add(contextName);
      }
      return next;
    });
  };

  // Load contexts on mount
  useEffect(() => {
    async function loadContexts() {
      try {
        const result = await invoke<KubeContextsResult>("get_kube_contexts");
        setKubeconfigPath(result.kubeconfig_path);
        setContexts(result.contexts);
        
        // Initialize namespace states for all contexts
        const initialStates: ContextNamespaceState[] = result.contexts.map(ctx => ({
          context: ctx.name,
          namespaces: null,
          error: null,
          loading: true,
        }));
        setContextNamespaces(initialStates);
        
        // Fetch namespaces for all contexts in parallel
        result.contexts.forEach(async (ctx, index) => {
          try {
            const namespaces = await invoke<string[]>("get_namespaces_for_context", {
              context: ctx.name,
            });
            setContextNamespaces(prev => {
              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                namespaces,
                loading: false,
              };
              return updated;
            });
          } catch (e) {
            setContextNamespaces(prev => {
              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                error: String(e),
                loading: false,
              };
              return updated;
            });
          }
        });
        
        setLoading(false);
      } catch (e) {
        setError(String(e));
        setLoading(false);
      }
    }
    
    loadContexts();
  }, []);

  const handleCreateConfig = async () => {
    setCreating(true);
    try {
      const contextNames = contexts.map(ctx => ctx.name);
      const namespaceData = contextNamespaces.map(cn => ({
        context: cn.context,
        namespaces: cn.namespaces,
      }));
      
      const path = await invoke<string>("create_kubby_config", {
        contexts: contextNames,
        contextNamespaces: namespaceData,
      });
      
      setConfigPath(path);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleCopyPath = async () => {
    if (!configPath) return;
    try {
      await writeText(configPath);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (e) {
      console.error("Failed to copy path:", e);
    }
  };

  const handleEditConfig = async () => {
    if (!configPath) return;
    try {
      await invoke("open_file_in_editor", { path: configPath });
    } catch (e) {
      console.error("Failed to open editor:", e);
    }
  };

  // Check if any context has namespace errors
  const hasNamespaceErrors = contextNamespaces.some(cn => cn.error !== null);
  const allLoaded = contextNamespaces.every(cn => !cn.loading);

  if (loading) {
    return (
      <div class={classes.onboarding}>
        <div class={classes.loading}>Discovering Kubernetes contexts...</div>
      </div>
    );
  }

  if (error && !configPath) {
    return (
      <div class={classes.onboarding}>
        <div class={classes.error}>
          <div>Failed to load Kubernetes configuration</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div class={classes.onboarding}>
      <div class={classes.header}>
        <div class={classes.logo}>
          <KubbyTitle/>
        </div>
        {version && <div class={classes.version}>v{version}</div>}
        <p class={classes.subtitle}>
          Kubby needs a configuration file to know which contexts and namespaces to display on the dashboard.
          We'll help you create one based on your kubeconfig.
        </p>
      </div>

      {hasNamespaceErrors && (
        <div class={classes.warningSection}>
          <Alert
            type="warning"
            label="Manual Edit Required"
            message={<><p>Some contexts could not be accessed to discover namespaces. This can happen if you do not have access rights to list namespaces in a context.</p><p>You can still create the config, however, the dashboard will not show namespaces for these contexts. Manually edit the config file after creating it to add the namespaces you want to display.</p></>}
          />
        </div>
      )}


      {/* Config created success section */}
      {configPath && (
        <div class={classes.successSection}>
          <h2 class={classes.successTitle}>Configuration Created</h2>
          <div class={classes.configPath}>
            <code>{configPath}</code>
            <div class={classes.pathActions}>
              <button
                class={classes.secondaryButton}
                onClick={handleCopyPath}
              >
                {copySuccess ? "Copied!" : "Copy Path"}
              </button>
              <button
                class={classes.secondaryButton}
                onClick={handleEditConfig}
              >
                Open
              </button>
            </div>
          </div>

        </div>
      )}

      {/* Actions */}
      <div class={classes.actions}>
        {!configPath ? (
          <button
            class={classes.primaryButton}
            onClick={handleCreateConfig}
            disabled={creating || !allLoaded || contexts.length === 0}
          >
            {creating ? "Creating..." : "Create Config"}
          </button>
        ) : (
          <button
            class={classes.primaryButton}
            onClick={onComplete}
          >
            Go to Dashboard
          </button>
        )}
      </div>

      <div class={classes.content}>
        {/* Kubeconfig info section */}
        <div class={classes.section}>
          <h2 className={classes.sectionTitle}>Discovered Kubeconfig</h2>
          <div class={classes.kubeconfigPath}>
            <span>Path:</span>
            <code>{kubeconfigPath}</code>
          </div>

          <h2 className={classes.sectionTitle}>Contexts and namespaces from your Kube config:</h2>

          {contexts.length === 0 ? (
            <div class={classes.noContexts}>No contexts found in kubeconfig</div>
          ) : (
            <div class={classes.contextList}>
              {contexts.map((ctx, index) => {
                const nsState = contextNamespaces[index]
                return (
                  <div key={ctx.name} class={classes.contextItem}>
                    <div class={classes.contextHeader}>
                      <span class={classes.contextName}>{ctx.name}</span>
                      {ctx.is_current && (
                        <span class={classes.currentBadge}>current</span>
                      )}
                    </div>

                    {nsState?.loading && (
                      <div class={classes.contextLoading}>Loading namespaces...</div>
                    )}

                    {nsState?.error && (
                      <div class={classes.contextError}>
                        <span
                          class={expandedErrors.has(ctx.name) ? classes.errorTextExpanded : classes.errorTextCollapsed}>
                          {nsState.error}
                        </span>
                        <button
                          class={classes.expandButton}
                          onClick={() => toggleErrorExpanded(ctx.name)}
                          title={expandedErrors.has(ctx.name) ? 'Collapse' : 'Expand'}
                        >
                          {expandedErrors.has(ctx.name) ? '−' : '+'}
                        </button>
                      </div>
                    )}

                    {nsState?.namespaces && nsState.namespaces.length > 0 && (
                      <div class={classes.namespaceList}>
                        {nsState.namespaces.map(ns => (
                          <span key={ns} class={classes.namespaceTag}>{ns}</span>
                        ))}
                      </div>
                    )}

                    {nsState?.namespaces && nsState.namespaces.length === 0 && (
                      <div class={classes.contextLoading}>No namespaces found</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
